//! This module implements support for the "task log" -- the main logfile for a task.
//!
//! This includes
//!
//!  * writing the log to disk (TODO)
//!  * live logging (TODO)
//!  * uploading a log artifact at task completion

use crate::process::{Process, ProcessFactory, ProcessHandle};
use crate::tc::ServiceFactory;
use async_trait::async_trait;
use chrono::prelude::*;
use serde::Deserialize;
use slog::{debug, Logger};
use std::sync::Arc;
use taskcluster::{ClientBuilder, Credentials, Object, Retry};
use taskcluster_upload::upload_from_buf;
use tokio::sync::mpsc;

/// A TaskLogFactory is a ProcessFactory that accepts "commands" in the form of byte vectors,
/// and concatenates them to form the log.  When the command channel ends, it finishes the log
/// appropriately and exits.
pub(crate) struct TaskLogFactory {
    logger: Logger,
    service_factory: Arc<dyn ServiceFactory>,
    task_id: String,
    run_id: u32,
    expires: DateTime<Utc>,
}

impl TaskLogFactory {
    pub(crate) fn new(
        logger: Logger,
        service_factory: Arc<dyn ServiceFactory>,
        task_id: String,
        run_id: u32,
        expires: DateTime<Utc>,
    ) -> Self {
        Self {
            logger,
            service_factory,
            task_id,
            run_id,
            expires,
        }
    }
}

#[async_trait]
impl ProcessFactory for TaskLogFactory {
    type Command = Vec<u8>;

    async fn run(self, mut commands: mpsc::Receiver<Self::Command>) -> anyhow::Result<()> {
        let mut log = vec![];

        // read buffers until EOF, writing them to the log
        loop {
            tokio::select! {
                maybe_buf = commands.recv() => {
                    if let Some(buf) = maybe_buf {
                        log.extend(buf);
                    } else {
                        break;
                    }
                }
            }
        }

        // ..and then upload the log artifact

        debug!(self.logger, "uploading task-log artifact");
        let run_id_str = format!("{}", self.run_id);
        let res = self
            .service_factory
            .queue()?
            .createArtifact(
                &self.task_id,
                &run_id_str,
                "public/logs/live.log",
                &serde_json::json!({
                    "storageType": "object",
                    "contentType": "text/plain",
                    "expires": self.expires,
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

        let object = Object::new(
            ClientBuilder::new(&self.service_factory.root_url()).credentials(res.credentials),
        )?;
        let retry = Retry::default();
        upload_from_buf(
            &res.project_id,
            &res.name,
            "text/plain",
            &res.expires,
            &log,
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
                "public/logs/live.log",
                &serde_json::json!({
                    "uploadId": res.upload_id,
                }),
            )
            .await?;

        Ok(())
    }
}

/// A TaskLog supports writing to a task log.  It is possible to have multiple TaskLog instances
/// open at the same time, so as much as possible output should be newline-terminated, although
/// this is not a hard requirement.
#[derive(Clone)]
pub struct TaskLog(ProcessHandle<Vec<u8>>);

impl TaskLog {
    pub(crate) fn new(process: &Process<Vec<u8>>) -> anyhow::Result<Self> {
        Ok(Self(process.handle()?))
    }

    /// Write data to the task log.  If a failure to write to the log is OK, then it's
    /// safe to ignore the result of this operation.
    pub async fn write_all<B: AsRef<[u8]>>(&mut self, buf: B) -> anyhow::Result<()> {
        self.0.command(buf.as_ref().to_vec()).await
    }
}
