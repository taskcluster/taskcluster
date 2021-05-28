use crate::claim::WorkClaimer;
use crate::execute::{Executor, Payload};
use crate::process::{Process, ProcessFactory};
use crate::tc::CredsContainer;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use slog::{info, o, Logger};
use std::marker::PhantomData;
use std::sync::Arc;
use taskcluster::Credentials;
use tokio::sync::mpsc;

/// Top-level struct combining all aspects of a worker together
pub struct Worker<P: Payload, E: Executor<P>> {
    logger: Option<Logger>,
    root_url: Option<String>,
    worker_creds: Option<Credentials>,
    task_queue_id: Option<String>,
    worker_group: Option<String>,
    worker_id: Option<String>,
    capacity: Option<usize>,
    executor: E,
    payload_type: PhantomData<P>,
}

impl<P: Payload, E: Executor<P>> Worker<P, E> {
    /// Begin creating a new worker, given the executor it will use.  This struct
    /// follows the builder pattern for specifying the remaining configuration.  Once
    /// all necessary parameters are supplied, call `start()`.
    pub fn new(executor: E) -> Self {
        Self {
            logger: None,
            root_url: None,
            worker_creds: None,
            task_queue_id: None,
            worker_group: None,
            worker_id: None,
            capacity: None,
            executor,
            payload_type: PhantomData,
        }
    }

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

    /// Start the Worker.  This process will fail immediately if any parameter that does not have a
    /// default is not set.
    pub fn start(self) -> Process<()> {
        ProcessFactory::start(self)
    }
}

#[async_trait]
impl<P: Payload, E: Executor<P>> ProcessFactory for Worker<P, E> {
    type Command = ();
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        let task_queue_id = self
            .task_queue_id
            .ok_or_else(|| anyhow!("task_queue_id not set"))?;
        let worker_group = self
            .worker_group
            .ok_or_else(|| anyhow!("worker_group not set"))?;
        let worker_id = self.worker_id.ok_or_else(|| anyhow!("worker_id not set"))?;
        let logger = self
            .logger
            .ok_or_else(|| anyhow!("logger not set"))?
            .new(o!(
                "worker_group" => worker_group.clone(),
                "worker_id" => worker_id.clone(),
                "task_queue_id" => task_queue_id.clone()));
        let root_url = self.root_url.ok_or_else(|| anyhow!("root_url not set"))?;
        let worker_creds = self
            .worker_creds
            .ok_or_else(|| anyhow!("worker_creds not set"))?;
        let capacity = self.capacity.unwrap_or(1);

        let creds_container = CredsContainer::new(root_url, worker_creds);
        let worker_service_factory = creds_container.as_service_factory();
        let executor = Arc::new(self.executor);
        let payload_type = self.payload_type;

        info!(logger, "Starting Worker");

        let mut work_claimer = WorkClaimer {
            logger,
            worker_service_factory,
            task_queue_id,
            worker_group,
            worker_id,
            capacity,
            executor,
            payload_type,
        }
        .start();

        // loop until we're told to stop..
        loop {
            tokio::select! {
                _ = commands.recv() => { work_claimer.stop().await?; },
                res = &mut work_claimer => { return res; },
            }
        }
    }
}
