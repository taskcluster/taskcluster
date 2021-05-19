use anyhow::Result;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;
use taskcluster::{ClientBuilder, Credentials, Queue};

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

#[derive(Deserialize, Debug)]
struct TaskStatus {
    #[serde(rename = "taskId")]
    task_id: String,
}

#[derive(Deserialize, Debug)]
struct TaskClaim {
    status: TaskStatus,
    task: serde_json::Value,
    credentials: Credentials,
    #[serde(rename = "runId")]
    run_id: u32,
}

pub struct WorkClaimer<EF, TE>
where
    EF: 'static + Send + Fn(String, Credentials, String, u32, serde_json::Value) -> TE,
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
}

impl<EF, TE> WorkClaimer<EF, TE>
where
    EF: 'static + Send + Fn(String, Credentials, String, u32, serde_json::Value) -> TE,
    TE: 'static + Send + TaskExecutor,
{
    /// Start claiming.  This returns a new object which can be used to control the
    /// running claimer.
    pub fn start(self) -> RunningWorkClaimer {
        let async_task = tokio::spawn(async move {
            self.run().await.expect("WorkClaimer.run failed");
        });

        RunningWorkClaimer { async_task }
    }

    async fn run(self) -> Result<()> {
        let queue =
            Queue::new(ClientBuilder::new(&self.root_url).credentials(self.worker_creds.clone()))?;
        let mut running = vec![];

        loop {
            println!("loop");
            let mut should_sleep = true;
            if running.len() < self.capacity {
                let payload = json!({
                    // TODO: just stall if this is zero
                    "tasks": self.capacity - running.len(),
                    "workerGroup": &self.worker_group,
                    "workerId": &self.worker_id,
                });
                let claims = queue.claimWork(&self.task_queue_id, &payload).await?;
                if let Some(task_claims) =
                    claims.get("tasks").map(|tasks| tasks.as_array()).flatten()
                {
                    // if we claimed anything, don't sleep before trying to claim again
                    if task_claims.len() > 0 {
                        println!("should not sleep");
                        should_sleep = false;
                    }

                    for task_claim in task_claims {
                        let task_claim: TaskClaim = serde_json::from_value(task_claim.clone())?;
                        let executor = (self.executor_factory)(
                            self.root_url.clone(),
                            task_claim.credentials,
                            task_claim.status.task_id,
                            task_claim.run_id,
                            task_claim.task,
                        );
                        running.push(tokio::spawn(async move {
                            executor.execute_task().await.unwrap()
                        }))
                    }
                }
            }

            if should_sleep {
                println!("sleeping 30s");
                tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
            }
        }
    }
}

pub struct RunningWorkClaimer {
    // TODO: eventually include a channel here for comms with the task
    async_task: tokio::task::JoinHandle<()>,
}

impl RunningWorkClaimer {
    /// Wait for the work claimer to finish
    pub async fn wait(self) {
        self.async_task.await.unwrap()
    }
}
