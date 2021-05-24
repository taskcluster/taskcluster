use crate::claim::TaskClaim;
use crate::execute::creds_container::CredsContainer;
use crate::execute::{ExecutionContext, Executor, Payload, QueueFactory, Success};
use crate::process::ProcessFactory;
use anyhow::Result;
use async_trait::async_trait;
use serde_json::json;
use slog::{error, Logger};
use std::marker::PhantomData;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Result of `run_inner`.
enum InnerResult {
    /// Task succeeded
    Ok,
    /// Task failed normally
    Failed,
    /// Task should be marked exception with reason "internal-error", logging the given error
    Err(anyhow::Error),
    /// Task should be marked exception, with the given reason
    Exception(&'static str),
    /// Task was cancelled and its status should not be updated
    #[allow(dead_code)]
    Cancelled,
}

pub(crate) struct ExecutionFactory<P: Payload, E: Executor<P>> {
    root_url: String,
    executor: Arc<E>,
    logger: Logger,
    task_claim: TaskClaim,
    creds_container: CredsContainer,
    _phantom: PhantomData<P>,
}

#[async_trait]
impl<P: Payload, E: Executor<P>> ProcessFactory for ExecutionFactory<P, E> {
    type Command = ();
    async fn run(self, commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        // get a copy of information to use when resolving the task
        let creds_container = self.creds_container.clone();
        let task_id = self.task_claim.task_id.clone();
        let run_id = self.task_claim.run_id.to_string();
        let logger = self.logger.clone();

        // call run_inner to do the dirty work, summarizing it into a result
        let res = self.run_inner(commands).await;

        // Report the task status to the queue.  Note that if any of these fail, the failure
        // will be logged and the worker will continue.  This may happen if, for example, the
        // task deadline is exceeded while stlil running.
        let queue = creds_container.queue()?;
        match res {
            InnerResult::Ok => {
                queue.reportCompleted(&task_id, &run_id).await?;
            }
            InnerResult::Failed => {
                queue.reportFailed(&task_id, &run_id).await?;
            }
            InnerResult::Exception(reason) => {
                queue
                    .reportException(&task_id, &run_id, &json!({ "reason": reason }))
                    .await?;
            }
            InnerResult::Err(err) => {
                error!(logger, "Internal Error executing task: {}", err);
                queue
                    .reportException(&task_id, &run_id, &json!({ "reason": "internal-error" }))
                    .await?;
            }
            InnerResult::Cancelled => {
                // nothing to do; the task is already resolved
            }
        };
        Ok(())
    }
}

impl<P: Payload, E: Executor<P>> ExecutionFactory<P, E> {
    pub(crate) fn new(
        root_url: String,
        executor: Arc<E>,
        logger: Logger,
        task_claim: TaskClaim,
    ) -> Self {
        let creds_container = CredsContainer::new(root_url.clone(), task_claim.credentials.clone());
        Self {
            root_url,
            executor,
            logger,
            task_claim,
            creds_container,
            _phantom: PhantomData,
        }
    }

    async fn run_inner(self, _commands: mpsc::Receiver<()>) -> InnerResult {
        // first, get the payload, failing with "malformed-payload"
        let payload: P = match P::from_value(self.task_claim.task.payload.clone()) {
            Ok(p) => p,
            Err(_) => {
                // TODO: create a live-log artifact containing this error
                return InnerResult::Exception("malformed-payload");
            }
        };

        let queue_factory = Box::new(self.creds_container);

        let ctx = ExecutionContext {
            task_id: self.task_claim.task_id,
            run_id: self.task_claim.run_id,
            task_def: self.task_claim.task,
            payload,
            logger: self.logger,
            root_url: self.root_url,
            queue_factory,
        };

        let executor = self.executor;
        let tokio_task = tokio::spawn(async move { executor.execute(ctx).await });

        // TODO: select! from task, commands, etc.

        match tokio_task.await {
            Ok(Ok(Success::Succeeded)) => InnerResult::Ok,
            Ok(Ok(Success::Failed)) => InnerResult::Failed,
            Ok(Err(e)) => InnerResult::Err(e),
            // if the task panics, it is returned as an outer error
            Err(e) => InnerResult::Err(e.into()),
        }
    }
}
