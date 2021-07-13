use super::long_poll::{ClaimWorkLongPoll, LongPollCommand};
use crate::execute::{ExecutionFactory, Executor, Payload};
use crate::process::{ProcessFactory, ProcessSet};
use crate::tc::ServiceFactory;
use anyhow::{bail, Context as AnyhowContext, Result};
use async_trait::async_trait;
use slog::{debug, error, info, o, Logger};
use std::marker::PhantomData;
use std::sync::Arc;
use tokio::sync::mpsc;

/// Initial state for a work claimer.  This struct does not have a `new` method because
/// there are just too many parameters to be usable.
pub struct WorkClaimer<P: Payload, E: Executor<P>> {
    pub logger: Logger,
    pub worker_service_factory: Arc<dyn ServiceFactory>,
    pub task_queue_id: String,
    pub worker_group: String,
    pub worker_id: String,
    pub capacity: usize,
    pub executor: Arc<E>,
    pub payload_type: PhantomData<P>,
}

#[derive(Debug)]
pub enum Command {
    GracefulTermination { finish_tasks: bool },
}

#[async_trait]
impl<P: Payload, E: Executor<P>> ProcessFactory for WorkClaimer<P, E> {
    type Command = Command;
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        let (tasks_tx, mut tasks_rx) = mpsc::channel(self.capacity);
        let mut long_poller = ClaimWorkLongPoll {
            logger: self.logger.clone(),
            tasks_tx,
            available_capacity: self.capacity,
            worker_service_factory: self.worker_service_factory.clone(),
            task_queue_id: self.task_queue_id,
            worker_group: self.worker_group,
            worker_id: self.worker_id,
        }
        .start();

        let mut running = ProcessSet::new();

        loop {
            let num_running = running.len();
            tokio::select! {
                Some(task_claim) = tasks_rx.recv(), if num_running < self.capacity => {
                    let logger = self.logger.new(o!("task_id" => task_claim.task_id.clone(), "run_id" => task_claim.run_id));
                    info!(logger, "Starting task");
                    let ef = ExecutionFactory::new(self.worker_service_factory.root_url(), self.executor.clone(), logger, task_claim);
                    running.add(ef.start());
                },
                maybe_cmd = commands.recv() => {
                    match maybe_cmd {
                        Some(Command::GracefulTermination { finish_tasks: true }) => {
                            // the shutdown code after the loop body will wait for all
                            // running tasks to complete
                            break;
                        }
                        Some(Command::GracefulTermination { finish_tasks: false }) | None => {
                            info!(self.logger, "Shutting down running tasks immediately");
                            // NOTE: this currently causes some errors to be reported from the
                            // tokio runtime, but the desired effect occurs all the same: the
                            // worker exits.
                            for proc in running.iter() {
                                proc.stop().await?;
                            }
                            break;
                        }
                    }
                }
                res = (&mut long_poller) => {
                    if res.is_err() {
                        return res.context("ClaimWorkLongPoll process failed")
                    }
                    bail!("ClaimWorkLongPoll process exited unexpectedly");
                }
                res = running.wait(), if num_running > 0 => {
                    // a running task process has completed, so we can poll for one
                    // more task
                    debug!(self.logger, "process complete -> sending increment"; "num-running" => running.len());
                    long_poller.command(LongPollCommand::IncrementCapacity).await?;
                    // if the execution failed, log that and move on.
                    if let Err(e) = res.context("Internal task execution error") {
                        error!(self.logger, "{:?}", e);
                    }
                },
            }
        }

        // abort the long poller so that we do not claim more tasks, and so that any ongoing
        // long polling is dropped.  The process will end in an error, so we ignore the result.
        long_poller.abort().await?;
        let _ = long_poller.await;

        if running.len() > 0 {
            info!(self.logger, "Waiting for running tasks to complete");
            running.wait_all().await?;
        }

        debug!(self.logger, "Work Claimer is finished");
        return Ok(());
    }
}
