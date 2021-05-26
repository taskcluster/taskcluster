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
use bytes::{Bytes, BytesMut};
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

    /// Start the task log, returning a Process representing it and a TaskLog
    pub fn start(self) -> (Process<Bytes>, TaskLog) {
        let process = ProcessFactory::start(self);
        let handle = process.handle().unwrap();
        (process, TaskLog::new(handle))
    }
}

#[async_trait]
impl ProcessFactory for TaskLogFactory {
    type Command = Bytes;

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

/// A TaskLogSink supports writing to a task log.  It is typically wrapped in a [`TaskLog`] for
/// convenience.
#[async_trait]
pub trait TaskLogSink: 'static + Sync + Send {
    async fn write_all(&self, buf: Bytes) -> anyhow::Result<()>;
}

/// A ProessHandle of the type returned for the TaskLogSink process can be used as a TaskLogSink.
#[async_trait]
impl TaskLogSink for ProcessHandle<Bytes> {
    /// Write data to the task log.  If a failure to write to the log is OK, then it's
    /// safe to ignore the result of this operation.
    async fn write_all(&self, buf: Bytes) -> anyhow::Result<()> {
        self.command(buf).await
    }
}

/// A TaskLog is a convenient was to write data to a task log.  The value can be freely cloned,
/// as it uses reference counting internally, but note that the log cannot be finishe duntil
/// all references are dropped.
///
/// In testing, a test TaskLogSink can be wrapped with this
#[derive(Clone)]
pub struct TaskLog(Arc<dyn TaskLogSink>);

impl TaskLog {
    pub fn new<TLS: TaskLogSink>(tls: TLS) -> Self {
        TaskLog(Arc::new(tls))
    }

    /// Determine if this is the last reference to the contained TaskLogSink.  This is useful
    /// for logging purposes
    pub(crate) fn is_last_ref(&self) -> bool {
        Arc::strong_count(&self.0) == 1 || Arc::weak_count(&self.0) == 0
    }

    /// Write all of the given data to the log.  As writes may be interleaved, this data should
    /// end on a new line.
    pub async fn write_all<B: Into<Bytes>>(&self, buf: B) -> anyhow::Result<()> {
        self.0.write_all(buf.into()).await
    }

    /// write a line, appending a newline to it.
    pub async fn writeln(&self, line: &str) -> anyhow::Result<()> {
        let mut bytes = BytesMut::with_capacity(line.len() + 1);
        bytes.extend_from_slice(line.as_bytes());
        bytes.extend_from_slice(b"\n");
        self.write_all(bytes).await
    }

    /// Try writing a buffer, but ignore failure.  This is useful for logging errors, for example.
    pub async fn try_write_all<B: Into<Bytes>>(&self, buf: B) {
        let _ = self.write_all(buf).await;
    }

    /// Try writing a line, but ignore failure.  This is useful for logging errors, for example.
    pub async fn try_writeln(&self, line: &str) {
        let _ = self.writeln(line).await;
    }
}
