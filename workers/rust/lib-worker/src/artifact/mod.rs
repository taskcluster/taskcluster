//! This module handles interfacing with queue artifacts:
//!
//! * Uploading data artifacts during task execution
//! * Uploading special artifacts like 'link', 'error', and 'redirect'
//! * Downloading artifacts (TODO)

use crate::tc::ServiceFactory;
use async_trait::async_trait;
use chrono::prelude::*;
use serde::Deserialize;
use slog::{info, o, Logger};
use std::sync::Arc;
use taskcluster::{ClientBuilder, Credentials, Object, Retry};
use taskcluster_upload::{upload_with_factory, CursorReaderFactory, FileReaderFactory};
use tokio::fs::File;
use tokio::io::{AsyncRead, AsyncSeekExt, SeekFrom};

pub use taskcluster_upload::AsyncReaderFactory;

/// An ArtifactManager manages interactions with artifacts, in the context of a task execution.
/// It is implemented as a trait to allow fake versions for testing.
#[async_trait]
pub trait ArtifactManager: 'static + Send + Sync {
    /// Create an artifact on the current task from a buffer of bytes
    async fn create_artifact_from_buf(
        &self,
        name: &str,
        content_type: &str,
        expires: DateTime<Utc>,
        data: &[u8],
    ) -> anyhow::Result<()> {
        self.create_artifact_with_factory(
            name,
            content_type,
            data.len() as u64,
            expires,
            Box::new(CursorReaderFactory::new(data)),
        )
        .await
    }

    /// Create an artifact ont he current task from a file.
    async fn create_artifact_from_file(
        &self,
        name: &str,
        content_type: &str,
        expires: DateTime<Utc>,
        mut file: File,
    ) -> anyhow::Result<()> {
        let content_length = file.seek(SeekFrom::End(0)).await?;
        self.create_artifact_with_factory(
            name,
            content_type,
            content_length,
            expires,
            Box::new(FileReaderFactory::new(file)),
        )
        .await
    }

    /// Create an artifact ont he current task from an [`AsyncReaderFactory`], passed as a trait
    /// object.
    async fn create_artifact_with_factory(
        &self,
        name: &str,
        content_type: &str,
        content_length: u64,
        expires: DateTime<Utc>,
        factory: Box<dyn AsyncReaderFactory + 'static + Sync + Send>,
    ) -> anyhow::Result<()>;
}

/// An [`ArtifactManager`] that uploads artifacts to a running task
pub(crate) struct TaskArtifactManager {
    logger: Logger,
    service_factory: Arc<dyn ServiceFactory>,
    task_id: String,
    run_id: u32,
}

impl TaskArtifactManager {
    pub(crate) fn new(
        logger: Logger,
        service_factory: Arc<dyn ServiceFactory>,
        task_id: String,
        run_id: u32,
    ) -> Arc<dyn ArtifactManager> {
        Arc::new(Self {
            logger,
            service_factory,
            task_id,
            run_id,
        })
    }
}

/// Wrap Box<dyn AsyncReaderFactory> as an AsyncReaderFactory
struct Factory(Box<dyn AsyncReaderFactory + 'static + Send + Sync>);

#[async_trait]
impl AsyncReaderFactory for Factory {
    async fn get_reader<'a>(
        &'a mut self,
    ) -> anyhow::Result<Box<dyn AsyncRead + Sync + Send + Unpin + 'static>> {
        self.0.get_reader().await
    }
}

#[async_trait]
impl ArtifactManager for TaskArtifactManager {
    async fn create_artifact_with_factory(
        &self,
        name: &str,
        content_type: &str,
        content_length: u64,
        expires: DateTime<Utc>,
        factory: Box<dyn AsyncReaderFactory + 'static + Sync + Send>,
    ) -> anyhow::Result<()> {
        info!(self.logger, "Uploading artifact"; o!("name" => name, "content-type" => content_type));
        let run_id_str = format!("{}", self.run_id);
        let res = self
            .service_factory
            .queue()?
            .createArtifact(
                &self.task_id,
                &run_id_str,
                name,
                &serde_json::json!({
                    "storageType": "object",
                    "contentType": content_type,
                    "expires": expires,
                }),
            )
            .await?;

        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct CreateArtifactResponse {
            credentials: Credentials,
            expires: DateTime<Utc>,
            name: String,
            project_id: String,
            upload_id: String,
        }
        let res: CreateArtifactResponse = serde_json::from_value(res)?;

        let factory = Factory(factory);
        let object = Object::new(
            ClientBuilder::new(&self.service_factory.root_url()).credentials(res.credentials),
        )?;
        let retry = Retry::default();
        upload_with_factory(
            &res.project_id,
            &res.name,
            content_type,
            content_length,
            &res.expires,
            factory,
            &retry,
            &object,
            &res.upload_id,
        )
        .await?;

        self.service_factory
            .queue()?
            .finishArtifact(
                &self.task_id,
                &run_id_str,
                name,
                &serde_json::json!({
                    "uploadId": res.upload_id,
                }),
            )
            .await?;

        Ok(())
    }
}
