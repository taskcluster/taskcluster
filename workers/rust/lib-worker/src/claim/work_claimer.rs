use super::long_poll::{ClaimWorkLongPoll, LongPollCommand};
use crate::execute::{ExecutionFactory, Executor, Payload};
use crate::process::{Process, ProcessFactory, ProcessSet};
use crate::tc::{CredsContainer, ServiceFactory};
use anyhow::{bail, Context as AnyhowContext, Result};
use async_trait::async_trait;
use slog::{debug, error, info, o, Logger};
use std::marker::PhantomData;
use std::sync::Arc;
use taskcluster::Credentials;
use tokio::sync::mpsc;

/// Builder struct for [`WorkClaimer`]
pub struct WorkClaimerBuilder<P: Payload, E: Executor<P>> {
    logger: Option<Logger>,
    root_url: Option<String>,
    worker_creds: Option<Credentials>,
    worker_service_factory: Option<Arc<dyn ServiceFactory>>,
    task_queue_id: Option<String>,
    worker_group: Option<String>,
    worker_id: Option<String>,
    capacity: Option<usize>,
    executor: E,
    payload_type: PhantomData<P>,
}

impl<P: Payload, E: Executor<P>> WorkClaimerBuilder<P, E> {
    /// Set the [`slog::Logger`] that will be used by this work claimer
    pub fn logger(mut self, logger: Logger) -> Self {
        self.logger = Some(logger);
        self
    }

    /// Set the root URL for this work claimer
    pub fn root_url<S: Into<String>>(mut self, root_url: S) -> Self {
        self.root_url = Some(root_url.into());
        self
    }

    /// Set the (initial) worker credentials
    pub fn worker_creds(mut self, worker_creds: Credentials) -> Self {
        self.worker_creds = Some(worker_creds);
        self
    }

    /// Set a [`ServiceFactory`] that will supply worker credentials.  This is typically only used
    /// in tests, as a way to inject fake services, and overrides `worker_creds` and `root_url`,
    /// making them unnecessary.
    pub fn worker_service_factory(
        mut self,
        worker_service_factory: Arc<dyn ServiceFactory>,
    ) -> Self {
        self.worker_service_factory = Some(worker_service_factory);
        self
    }

    /// Set the task-queue-id for this work claimer
    pub fn task_queue_id<S: Into<String>>(mut self, task_queue_id: S) -> Self {
        self.task_queue_id = Some(task_queue_id.into());
        self
    }

    /// Set the worker-group for this work claimer
    pub fn worker_group<S: Into<String>>(mut self, worker_group: S) -> Self {
        self.worker_group = Some(worker_group.into());
        self
    }

    /// Set the worker-id for this work claimer
    pub fn worker_id<S: Into<String>>(mut self, worker_id: S) -> Self {
        self.worker_id = Some(worker_id.into());
        self
    }

    /// Set the worker's capacity: the number of concurrent tasks it can execute.  This defaults to
    /// 1.
    pub fn capacity(mut self, capacity: usize) -> Self {
        self.capacity = Some(capacity);
        self
    }

    /// Build the WorkClaimer.  This will panic if any parameter that does not have
    /// a default is not set.
    pub fn build(self) -> WorkClaimer<P, E> {
        let task_queue_id = self.task_queue_id.expect("task_queue_id not set");
        let worker_group = self.worker_group.expect("worker_group not set");
        let worker_id = self.worker_id.expect("worker_id not set");
        let logger = self.logger.expect("logger not set").new(o!(
                "worker_group" => worker_group.clone(),
                "worker_id" => worker_id.clone(),
                "task_queue_id" => task_queue_id.clone()));
        let worker_service_factory = if self.worker_service_factory.is_some() {
            self.worker_service_factory.unwrap()
        } else {
            let root_url = self.root_url.expect("root_url not set");
            Arc::new(CredsContainer::new(
                root_url,
                self.worker_creds
                    .expect("neither worker_service_factory not worker_creds are set"),
            ))
        };
        let capacity = self.capacity.unwrap_or(1);
        let executor = Arc::new(self.executor);
        let payload_type = self.payload_type;

        WorkClaimer {
            logger,
            worker_service_factory,
            task_queue_id,
            worker_group,
            worker_id,
            capacity,
            executor,
            payload_type,
        }
    }
}

/// Initial state for a work claimer.
pub struct WorkClaimer<P: Payload, E: Executor<P>> {
    logger: Logger,
    worker_service_factory: Arc<dyn ServiceFactory>,
    task_queue_id: String,
    worker_group: String,
    worker_id: String,
    capacity: usize,
    executor: Arc<E>,
    payload_type: PhantomData<P>,
}

impl<P: Payload, E: Executor<P>> WorkClaimer<P, E> {
    /// Create a new WorkClaimer based on the given configuration
    pub fn new(executor: E) -> WorkClaimerBuilder<P, E> {
        WorkClaimerBuilder {
            logger: None,
            root_url: None,
            worker_creds: None,
            worker_service_factory: None,
            task_queue_id: None,
            worker_group: None,
            worker_id: None,
            capacity: None,
            executor,
            payload_type: PhantomData,
        }
    }

    /// Start the work-claimer, returning a Process representing it.
    pub fn start(self) -> Process<Command> {
        ProcessFactory::start(self)
    }
}

#[derive(Debug)]
pub enum Command {
    // TODO: GracefulStop, Credentials(new_worker_creds)
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
                None = commands.recv() => {
                    long_poller.stop().await?;
                    // TODO: stop gracefully by default?
                    for proc in running.iter() {
                        proc.stop().await?;
                    }
                    running.wait_all().await?;
                    return Ok(())
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
    }
}
