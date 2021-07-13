use crate::claim::{self, WorkClaimer};
use crate::execute::{Executor, Payload};
use crate::process::{Process, ProcessFactory};
use crate::tc::CredsContainer;
use crate::workerproto::{Capabilities, Capability, Message, Protocol, Transport};
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use slog::{debug, info, o, Drain, Logger};
use std::marker::PhantomData;
use std::sync::Arc;
use taskcluster::Credentials;
use tokio::sync::mpsc;

/// Top-level struct combining all aspects of a worker together
pub struct Worker<P: Payload, E: Executor<P>> {
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
        let root_url = self.root_url.ok_or_else(|| anyhow!("root_url not set"))?;
        let worker_creds = self
            .worker_creds
            .ok_or_else(|| anyhow!("worker_creds not set"))?;
        let capacity = self.capacity.unwrap_or(1);

        let creds_container = CredsContainer::new(root_url, worker_creds);
        let worker_service_factory = creds_container.as_service_factory();
        let executor = Arc::new(self.executor);
        let payload_type = self.payload_type;

        // if we're attache to a tty, we assume we're running in a testing environment
        // and not worker-runner (which would connect stdio to a pipe, not a tty)
        let use_worker_runner = atty::isnt(atty::Stream::Stdin);

        let mut proto = Self::start_proto(use_worker_runner).await?;

        // TODO: when using worker-runner, pipe this over the protocol instead
        let decorator = slog_term::TermDecorator::new().build();
        let drain = slog_term::FullFormat::new(decorator).build().fuse();
        let drain = slog_async::Async::new(drain).build().fuse();
        let logger = Logger::root(
            drain,
            o!(
                "worker_group" => worker_group.clone(),
                "worker_id" => worker_id.clone(),
                "task_queue_id" => task_queue_id.clone()),
        );

        info!(logger, "Starting Worker"; o!(
            "use_worker_runner" => use_worker_runner,
            "capabilities" => proto.capabilities().to_vec().join(", ")));

        let mut work_claimer = WorkClaimer {
            logger: logger.clone(),
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
                Some(msg) = proto.recv() => {
                    match msg {
                        Message::GracefulTermination { finish_tasks }=> {
                            debug!(logger, "Initiating graceful termination");
                            work_claimer.command(claim::Command::GracefulTermination { finish_tasks } ).await?;
                        }
                        Message::NewCredentials { client_id, access_token, certificate } =>  {
                            debug!(logger, "Got new worker credentials"; o!("clientId" => &client_id));
                            let creds = Credentials {client_id, access_token, certificate};
                            creds_container.set_creds(creds);
                        }
                        _ => info!(logger, "Unhandled worker-runner message {:?}", msg),
                    }
                }
                res = &mut work_claimer => { return res; },
            }
        }
    }
}

/// The capabilities defined by this library
const CAPABILITIES: &[Capability] = &[
    Capability::Log,
    Capability::GracefulTermination,
    Capability::NewCredentials,
];

impl<P: Payload, E: Executor<P>> Worker<P, E> {
    /// Start the worker-runner protocol.  If `use_worker_runner` is false, ten the protocol is
    /// started with no capabilities, and no negotiation takes place -- this is suitable for
    /// running things in testing.
    async fn start_proto(
        use_worker_runner: bool,
    ) -> anyhow::Result<Protocol<tokio::io::Stdin, tokio::io::Stdout>> {
        if !use_worker_runner {
            return Ok(Protocol::new(
                Transport::new(tokio::io::stdin(), tokio::io::stdout()),
                Capabilities::from_capabilities(&[]),
            ));
        }

        let mut proto = Protocol::new(
            Transport::new(tokio::io::stdin(), tokio::io::stdout()),
            Capabilities::from_capabilities(CAPABILITIES),
        );
        proto.negotiate().await?;

        Ok(proto)
    }
}
