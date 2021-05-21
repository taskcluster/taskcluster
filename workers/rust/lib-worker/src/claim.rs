use crate::executor::Executor;
use crate::process::{ProcessFactory, ProcessSet};
use anyhow::{bail, Context as AnyhowContext, Result};
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
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
    /// The capacity for this worker (total number of tasks it can run in parallel)
    pub capacity: usize,

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

    /// An executor to execute the claimed tasks
    pub executor: E,
}

/// Initial state for a work claimer.
pub struct WorkClaimer<E: Executor> {
    cfg: WorkClaimerConfig<E>,
    // TODO this may later have private fields?
}

// TODO: new from another struct so that caller isn't expected to set internal tracking fields

#[derive(Debug)]
pub enum Command {
    // TODO: task complete
// TODO: graceful
// TODO: update worker creds
}

#[async_trait]
impl<E: Executor> ProcessFactory for WorkClaimer<E> {
    type Command = Command;
    async fn run(self, commands: mpsc::Receiver<Self::Command>) {
        self.claim_loop(commands)
            .await
            .expect("work claimer failed");
    }
}

impl<E: Executor> WorkClaimer<E> {
    /// Create a new WorkClaimer based on the given configuration
    pub fn new(cfg: WorkClaimerConfig<E>) -> Self {
        Self { cfg }
    }

    async fn claim_loop(mut self, mut commands: mpsc::Receiver<Command>) -> Result<()> {
        let (tasks_tx, mut tasks_rx) = mpsc::channel(self.cfg.capacity);
        let mut long_poller = ClaimWorkLongPoll {
            tasks_tx,
            available_capacity: self.cfg.capacity,
            root_url: self.cfg.root_url,
            worker_creds: self.cfg.worker_creds,
            task_queue_id: self.cfg.task_queue_id,
            worker_group: self.cfg.worker_group,
            worker_id: self.cfg.worker_id,
        }
        .start();

        let mut running = ProcessSet::new();

        loop {
            println!("loop");
            let num_running = running.len();
            tokio::select! {
                Some(task_claim) = tasks_rx.recv(), if num_running < self.cfg.capacity => {
                    running.add(self.cfg.executor.start_task(task_claim));
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
                _ = running.wait(), if num_running > 0 => {
                    // a running task process has completed, so we can poll for one
                    // more task
                    long_poller.command(LongPollCommand::IncrementCapacity).await?;
                },
            }
        }
    }
}

/// A process to manage the long-polling calls to queue.claimWork, minimizing the number of times
/// we interrupt the connection.
struct ClaimWorkLongPoll {
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
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) {
        let queue =
            Queue::new(ClientBuilder::new(&self.root_url).credentials(self.worker_creds.clone()))
                .unwrap();

        // ideally, we could run the `queue.claimWork` call concurrently with polling the command
        // channel, but the simpler option is to just alternate the two.
        loop {
            // first, read as much as we can from the channel, blocking if there's no capacity
            loop {
                println!("waiting for messages");
                tokio::select! {
                    biased;
                    cmd = commands.recv() => {
                        match cmd {
                            Some(LongPollCommand::IncrementCapacity) => self.available_capacity += 1,
                            None => return,
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
            println!("calling claimWork");
            let claims = queue
                .claimWork(&self.task_queue_id, &payload)
                .await
                .unwrap();
            if let Some(task_claims) = claims.get("tasks").map(|tasks| tasks.as_array()).flatten() {
                println!("claimWork returned {} tasks", task_claims.len());
                for v in task_claims {
                    let task_claim: TaskClaimJson = serde_json::from_value(v.clone()).unwrap();
                    self.available_capacity -= 1;
                    self.tasks_tx.send(task_claim.into()).await.unwrap();
                }
            } else {
                println!("claimWork returned nothing");
            }
        }
    }
}
