use crate::executor::Executor;
use crate::process::{ProcessFactory, ProcessSet};
use anyhow::Result;
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
        let queue = Queue::new(
            ClientBuilder::new(&self.cfg.root_url).credentials(self.cfg.worker_creds.clone()),
        )?;

        let mut running = ProcessSet::new();

        loop {
            println!("loop");
            let num_running = running.len();
            tokio::select! {
                // TODO: this gets interrupted on every message
                task_claims = self.long_poll(num_running, &queue), if num_running < self.cfg.capacity => {
                    for task_claim in task_claims? {
                        running.add(self.cfg.executor.start_task(task_claim));
                    }
                },
                // ..or, did we get a command
                None = commands.recv() => {
                    // TODO: stop gracefully by default?
                    for proc in running.iter() {
                        proc.stop().await?;
                    }
                    running.wait_all().await?;
                    return Ok(())
                }
                _ = running.wait(), if num_running > 0 => {
                    // a process has completed, so continue around the loop
                },
            }
        }
    }

    /// Call queue.claimWork if there is capacity for more tasks, or sleep for 30s.
    async fn long_poll(&self, num_running: usize, queue: &Queue) -> Result<Vec<TaskClaim>> {
        let payload = json!({
            "tasks": self.cfg.capacity - num_running,
            "workerGroup": &self.cfg.worker_group,
            "workerId": &self.cfg.worker_id,
        });
        println!("calling claimWork");
        let claims = queue.claimWork(&self.cfg.task_queue_id, &payload).await?;
        if let Some(task_claims) = claims.get("tasks").map(|tasks| tasks.as_array()).flatten() {
            println!("claimWork returned {} tasks", task_claims.len());
            return Ok(task_claims
                .iter()
                .map(|v| serde_json::from_value::<TaskClaimJson>(v.clone()))
                .map(|tcj| tcj.map(|tcj| TaskClaim::from(tcj)))
                .collect::<std::result::Result<Vec<_>, serde_json::Error>>()?);
        }
        println!("claimWork returned nothing");

        Ok(vec![])
    }
}
