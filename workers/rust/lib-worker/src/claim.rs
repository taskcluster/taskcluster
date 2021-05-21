use crate::executor::Executor;
use crate::process::{ProcessFactory, ProcessSet};
use anyhow::{bail, Context as AnyhowContext, Result};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use slog::{debug, error, info, o, trace, Logger};
use taskcluster::{ClientBuilder, Credentials, Queue};
use tokio::sync::mpsc;

#[derive(Deserialize)]
struct TaskStatusJson {
    #[serde(rename = "taskId")]
    task_id: String,
}

#[derive(Deserialize)]
struct TaskClaimJson {
    status: TaskStatusJson,
    task: serde_json::Value,
    credentials: Credentials,
    #[serde(rename = "runId")]
    run_id: u32,
}

/// Information about a single task as returned from `queue.claimWork`
#[derive(Debug)]
pub struct TaskClaim {
    pub task_id: String,
    pub run_id: u32,
    /// The task definition, still in JSON format
    pub task: serde_json::Value,
    /// The task credentials, to be used for reclaiming, artifacts, and so on.
    pub credentials: Credentials,
}

impl From<TaskClaimJson> for TaskClaim {
    fn from(tc: TaskClaimJson) -> TaskClaim {
        TaskClaim {
            task_id: tc.status.task_id,
            task: tc.task,
            credentials: tc.credentials,
            run_id: tc.run_id,
        }
    }
}

pub struct WorkClaimerConfig<E: Executor> {
    /// The logger for this process
    pub logger: Logger,

    /// The root URL for the deployment against which this worker is running
    pub root_url: String,

    /// Worker credentials valid at root URL
    pub worker_creds: Credentials,

    /// The `taskQueueId` from which to claim tasks
    pub task_queue_id: String,

    /// The `workerGroup` identifier for this worker
    pub worker_group: String,

    /// The `workerId` identifier for this worker
    pub worker_id: String,

    /// The capacity for this worker (total number of tasks it can run in parallel)
    pub capacity: usize,

    /// An executor to execute the claimed tasks
    pub executor: E,
}

/// Initial state for a work claimer.
pub struct WorkClaimer<E: Executor> {
    logger: Logger,
    root_url: String,
    worker_creds: Credentials,
    task_queue_id: String,
    worker_group: String,
    worker_id: String,
    capacity: usize,
    executor: E,
}

impl<E: Executor> WorkClaimer<E> {
    /// Create a new WorkClaimer based on the given configuration
    pub fn new(cfg: WorkClaimerConfig<E>) -> Self {
        Self {
            logger: cfg.logger.new(o!(
                "worker_group" => cfg.worker_group.clone(),
                "worker_id" => cfg.worker_id.clone(),
                "task_queue_id" => cfg.task_queue_id.clone())),
            root_url: cfg.root_url,
            worker_creds: cfg.worker_creds,
            task_queue_id: cfg.task_queue_id,
            worker_group: cfg.worker_group,
            worker_id: cfg.worker_id,
            capacity: cfg.capacity,
            executor: cfg.executor,
        }
    }
}

#[derive(Debug)]
pub enum Command {
    // TODO: GracefulStop, Credentials(new_worker_creds)
}

#[async_trait]
impl<E: Executor> ProcessFactory for WorkClaimer<E> {
    type Command = Command;
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        let (tasks_tx, mut tasks_rx) = mpsc::channel(self.capacity);
        let mut long_poller = ClaimWorkLongPoll {
            logger: self.logger.clone(),
            tasks_tx,
            available_capacity: self.capacity,
            root_url: self.root_url,
            worker_creds: self.worker_creds,
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
                    running.add(self.executor.execute(logger, task_claim));
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

/// A process to manage the long-polling calls to queue.claimWork, minimizing the number of times
/// we interrupt the connection.
struct ClaimWorkLongPoll {
    /// Logger for this instance
    logger: Logger,

    /// Channel over which new tasks are sent
    tasks_tx: mpsc::Sender<TaskClaim>,

    /// Current available capacity for new tasks
    available_capacity: usize,

    root_url: String,
    worker_creds: Credentials,
    task_queue_id: String,
    worker_group: String,
    worker_id: String,
}

#[derive(Debug)]
enum LongPollCommand {
    /// Increase the available capacity by one
    IncrementCapacity,
}

#[async_trait]
impl ProcessFactory for ClaimWorkLongPoll {
    type Command = LongPollCommand;
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        let queue =
            Queue::new(ClientBuilder::new(&self.root_url).credentials(self.worker_creds.clone()))?;

        // ideally, we could run the `queue.claimWork` call concurrently with polling the command
        // channel, but the simpler option is to just alternate the two.
        loop {
            // first, read as much as we can from the channel, blocking if there's no capacity
            loop {
                tokio::select! {
                    biased;
                    cmd = commands.recv() => {
                        match cmd {
                            Some(LongPollCommand::IncrementCapacity) => {
                                self.available_capacity += 1;
                                debug!(self.logger, "got IncrementCapacity"; "available_capacity" => self.available_capacity);
                            }
                            // command channel has closed -> time to exit
                            None => return Ok(()),
                        }
                    },
                    // if capacity is nonzero and there aren't messages, break out of the loop
                    _ = std::future::ready(()), if self.available_capacity != 0 => { break; }
                }
            }

            // next, perform the long poll and send the results
            let payload = json!({
                "tasks": self.available_capacity,
                "workerGroup": &self.worker_group,
                "workerId": &self.worker_id,
            });
            debug!(
                self.logger,
                "calling queue.claimWork for {} tasks", self.available_capacity
            );
            let claims = queue.claimWork(&self.task_queue_id, &payload).await?;
            if let Some(task_claims) = claims.get("tasks").map(|tasks| tasks.as_array()).flatten() {
                trace!(
                    self.logger,
                    "claimWork returned {} tasks",
                    task_claims.len()
                );
                for v in task_claims {
                    let task_claim: TaskClaimJson = serde_json::from_value(v.clone())?;
                    self.available_capacity -= 1;
                    debug!(self.logger, "sent a task"; "available_capacity" => self.available_capacity);
                    self.tasks_tx.send(task_claim.into()).await?;
                }
            }
        }
    }
}
