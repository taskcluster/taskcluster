use crate::process::ProcessFactory;
use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use taskcluster::{ClientBuilder, Credentials, Queue};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

#[async_trait]
pub trait TaskExecutor: Send {
    /// Perform the given task.  The task has already been claimed, and will be considered complete
    /// when the method's Future is complete.  If the returned [`Result`] is an `Err`, then the
    /// claimer will attempt to resolve the task as exception.  If the returned [`Result`] is `Ok`,
    /// then the task is presumed to have been resolved.  Implementers should attempt to handle all
    /// anticipated errors internally, reporting them as accurately as possible, and treat the
    /// `Err` response only as a catch-all for unexpected errors.
    async fn execute_task(self) -> Result<()>;
}

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

/// Initial state for a work claimer.
pub struct WorkClaimer<EF, TE>
where
    EF: 'static + Send + Fn(String, TaskClaim) -> TE,
    TE: 'static + Send + TaskExecutor,
{
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

    /// A function that will create a new TaskExecutor instance for the given task
    pub executor_factory: EF,

    /// Processes for running tasks
    pub running: Vec<JoinHandle<()>>,
}

// TODO: new from another struct so that caller isn't expected to set internal tracking fields

#[derive(Debug)]
pub enum Command {
    // TODO: task complete
// TODO: graceful
// TODO: update worker creds
}

#[async_trait]
impl<EF, TE> ProcessFactory for WorkClaimer<EF, TE>
where
    EF: 'static + Send + Fn(String, TaskClaim) -> TE,
    TE: 'static + Send + TaskExecutor,
{
    type Command = Command;
    async fn run(self, commands: mpsc::Receiver<Self::Command>) {
        self.claim_loop(commands)
            .await
            .expect("work claimer failed");
    }
}

impl<EF, TE> WorkClaimer<EF, TE>
where
    EF: 'static + Send + Fn(String, TaskClaim) -> TE,
    TE: 'static + Send + TaskExecutor,
{
    async fn claim_loop(mut self, mut commands: mpsc::Receiver<Command>) -> Result<()> {
        let queue =
            Queue::new(ClientBuilder::new(&self.root_url).credentials(self.worker_creds.clone()))?;

        loop {
            println!("loop");
            tokio::select! {
                // TODO: this gets interrupted on every message
                _ = self.long_poll(&queue), if self.running.len() < self.capacity => {},
                // ..or, did we get a command
                None = commands.recv() => {
                    // TODO: stop gracefully by default?
                    return Ok(())
                }
            }
        }
    }

    /// Call queue.claimWork if there is capacity for more tasks, or sleep for 30s.
    async fn long_poll(&mut self, queue: &Queue) -> Result<()> {
        let payload = json!({
            "tasks": self.capacity - self.running.len(),
            "workerGroup": &self.worker_group,
            "workerId": &self.worker_id,
        });
        println!("calling claimWork");
        let claims = queue.claimWork(&self.task_queue_id, &payload).await?;
        if let Some(task_claims) = claims.get("tasks").map(|tasks| tasks.as_array()).flatten() {
            println!("claimWork returned {} tasks", task_claims.len());
            for task_claim in task_claims {
                // TODO: another method
                // TODO: use ProcessFactory
                let task_claim: TaskClaimJson = serde_json::from_value(task_claim.clone())?;
                let task_claim: TaskClaim = task_claim.into();
                let executor = (self.executor_factory)(self.root_url.clone(), task_claim);
                self.running.push(tokio::spawn(async move {
                    executor.execute_task().await.unwrap()
                }))
            }
        }

        Ok(())
    }
}
