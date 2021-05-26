use crate::artifact::TaskArtifactManager;
use crate::claim::TaskClaim;
use crate::execute::{ExecutionContext, Executor, Payload, Success};
use crate::log::TaskLogFactory;
use crate::process::ProcessFactory;
use crate::tc::{CredsContainer, ServiceFactory};
use anyhow::Result;
use async_trait::async_trait;
use serde_json::json;
use slog::{error, info, Logger};
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

impl InnerResult {
    fn is_err(&self) -> bool {
        match self {
            InnerResult::Err(_) => true,
            _ => false,
        }
    }
}

pub(crate) struct ExecutionFactory<P: Payload, E: Executor<P>> {
    executor: Arc<E>,
    logger: Logger,
    task_claim: TaskClaim,
    service_factory: Arc<dyn ServiceFactory>,
    _phantom: PhantomData<P>,
}

#[async_trait]
impl<P: Payload, E: Executor<P>> ProcessFactory for ExecutionFactory<P, E> {
    type Command = ();
    async fn run(self, commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        // get a copy of information to use when resolving the task
        let service_factory = self.service_factory.clone();
        let task_id = self.task_claim.task_id.clone();
        let run_id = self.task_claim.run_id.to_string();
        let logger = self.logger.clone();

        // call run_inner to do the dirty work, summarizing it into a result
        let res = self.run_inner(commands).await;

        // Report the task status to the queue.  Note that if any of these fail, the failure
        // will be logged and the worker will continue.  This may happen if, for example, the
        // task deadline is exceeded while stlil running.
        let queue = service_factory.queue()?;
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
        let service_factory = Arc::new(CredsContainer::new(
            root_url,
            task_claim.credentials.clone(),
        ));
        Self {
            executor,
            logger,
            task_claim,
            service_factory,
            _phantom: PhantomData,
        }
    }

    async fn run_inner(self, mut commands: mpsc::Receiver<()>) -> InnerResult {
        let task_id = self.task_claim.task_id;
        let run_id = self.task_claim.run_id;

        let artifact_manager = TaskArtifactManager::new(
            self.logger.clone(),
            self.service_factory.clone(),
            task_id.clone(),
            run_id,
        );

        let (mut task_log_process, task_log) = TaskLogFactory::new(
            self.logger.clone(),
            artifact_manager.clone(),
            self.task_claim.task.expires,
        )
        .start();

        task_log
            .try_write_all(format!("Task ID: {}\n", &task_id))
            .await;

        // execute the task, using `break 'task_loop task_res` when done (note that this loop never
        // loops, but Rust does not yet allow labeled blocks)
        let task_res = 'task_loop: loop {
            // first, get the payload, failing with "malformed-payload"
            let payload: P = match P::from_value(self.task_claim.task.payload.clone()) {
                Ok(p) => p,
                Err(e) => {
                    // ignore the result; if things have exploded, that's OK, they'll
                    // be logged in the worker's log as well
                    task_log
                        .try_write_all(format!("Malformed payload: {}\n", e))
                        .await;
                    break 'task_loop InnerResult::Exception("malformed-payload");
                }
            };

            let ctx = ExecutionContext {
                task_id,
                run_id,
                task_def: self.task_claim.task,
                payload,
                logger: self.logger.clone(),
                artifact_manager,
                service_factory: self.service_factory,
                task_log: task_log.clone(),
            };

            let executor = self.executor;
            let tokio_task = tokio::spawn(async move { executor.execute(ctx).await });

            // keep tabs on the various bits that are executing, breaking out when
            // appropriate
            loop {
                tokio::select! {
                    res = tokio_task => {
                        break 'task_loop match res {
                            Ok(Ok(Success::Succeeded)) => InnerResult::Ok,
                            Ok(Ok(Success::Failed)) => InnerResult::Failed,
                            Ok(Err(e)) => {
                                task_log.try_write_all(format!("Error executing task: {}\n", e)).await;
                                InnerResult::Err(e)
                            }
                            // if the task panics, it is returned as an outer error
                            Err(e) => {
                                task_log.try_write_all(format!("Panic executing task: {}\n", e)).await;
                                InnerResult::Err(e.into())
                            }
                        }
                    }

                    cmd = commands.recv() => {
                        match cmd {
                            None => {
                                task_log.try_writeln("Execution abandoned: worker shutting down").await;
                                break 'task_loop InnerResult::Exception("worker-shutdown");
                            }
                            Some(()) => todo!() // no other messages defined yet
                        }
                    }
                }
            }
        };

        // stop the task log and wait for it to complete.  This will not occur until all references
        // to the task log are finished, so this may wait.  Issue a nice warning when that occurs.
        if !task_log.is_last_ref() {
            info!(
                self.logger,
                "TaskLog is still in use; waiting for all references to complete"
            );
        }
        drop(task_log);
        let mut tl_res = task_log_process.stop().await;
        if tl_res.is_ok() {
            tl_res = task_log_process.await;
        }

        match tl_res {
            // task log finished successfully, so return the result of the task
            Ok(_) => task_res,
            // finishing the task log failed, but we prefer to report the task's result
            // if it was also an error
            Err(_) if task_res.is_err() => task_res,
            Err(e) => InnerResult::Err(e.into()),
        }
    }
}
