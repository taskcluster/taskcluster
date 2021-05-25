use crate::claim::TaskClaim;
use crate::execute::creds_container::CredsContainer;
use crate::execute::{ExecutionContext, Executor, Payload, QueueFactory, Success};
use crate::log::{TaskLog, TaskLogFactory};
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

impl InnerResult {
    fn is_err(&self) -> bool {
        match self {
            InnerResult::Err(_) => true,
            _ => false,
        }
    }
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

    async fn run_inner(self, mut commands: mpsc::Receiver<()>) -> InnerResult {
        let task_id = self.task_claim.task_id;
        let run_id = self.task_claim.run_id;
        let queue_factory = Box::new(self.creds_container);

        let mut task_log_process = TaskLogFactory::new(
            self.logger.clone(),
            self.root_url.clone(),
            queue_factory.clone(),
            task_id.clone(),
            run_id,
            self.task_claim.task.expires,
        )
        .start();

        // get a TaskLog; in this case we know the process has not been
        // stopped, so it's safe to unwrap.
        let mut task_log = TaskLog::new(&task_log_process).unwrap();
        task_log
            .write_all(format!("Task ID: {}\n", &task_id))
            .await
            .unwrap();

        // execute the task, using `break 'task_loop task_res` when done (note that this loop never
        // loops, but Rust does not yet allow labeled blocks)
        let task_res = 'task_loop: loop {
            // first, get the payload, failing with "malformed-payload"
            let payload: P = match P::from_value(self.task_claim.task.payload.clone()) {
                Ok(p) => p,
                Err(e) => {
                    // ignore the result; if things have exploded, that's OK, they'll
                    // be logged in the worker's log as well
                    let _ignored = task_log
                        .write_all(format!("Malformed payload: {}\n", e))
                        .await;
                    break 'task_loop InnerResult::Exception("malformed-payload");
                }
            };

            let ctx = ExecutionContext {
                task_id,
                run_id,
                task_def: self.task_claim.task,
                payload,
                logger: self.logger,
                root_url: self.root_url,
                queue_factory,
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
                                let _ignored = task_log
                                    .write_all(format!("Error executing task: {}\n", e))
                                    .await;
                                InnerResult::Err(e)
                            }
                            // if the task panics, it is returned as an outer error
                            Err(e) => {
                                let _ignored = task_log
                                    .write_all(format!("Panic executing task: {}\n", e))
                                    .await;
                                InnerResult::Err(e.into())
                            }
                        }
                    }

                    cmd = commands.recv() => {
                        match cmd {
                            None => {
                                let _ignored = task_log
                                    .write_all(format!("Execution abandoned: worker shutting down\n"))
                                    .await;
                                break 'task_loop InnerResult::Exception("worker-shutdown");
                            }
                            Some(()) => todo!() // no other messages defined yet
                        }
                    }
                }
            }
        };

        // stop the task log and wait for it to complete
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
