use anyhow::Result;
use async_trait::async_trait;
use taskcluster::{ClientBuilder, Credentials, Queue};
use taskcluster_lib_worker::claiming::{TaskExecutor, WorkClaimer};

struct NullWorker {
    root_url: String,
    task_creds: Credentials,
    task_id: String,
    run_id: u32,
    task_def: serde_json::Value,
}

#[async_trait]
impl TaskExecutor for NullWorker {
    async fn execute_task(self) -> Result<()> {
        let queue =
            Queue::new(ClientBuilder::new(&self.root_url).credentials(self.task_creds.clone()))?;
        println!("execute {:?} / {}", self.task_id, self.run_id);
        dbg!(&self.task_def.get("payload").unwrap());
        queue
            .reportCompleted(&self.task_id, &format!("{}", self.run_id))
            .await?;
        Ok(())
    }
}

#[tokio::main]
async fn main() {
    let wc = WorkClaimer {
        capacity: 1,
        root_url: "https://dustin.taskcluster-dev.net".to_owned(),
        worker_creds: Credentials::from_env().unwrap(),
        task_queue_id: "aa/bb".to_owned(),
        worker_group: "rust".to_owned(),
        worker_id: "worker".to_owned(),
        executor_factory: |root_url, task_creds, task_id, run_id, task_def| NullWorker {
            root_url,
            task_creds,
            task_id,
            run_id,
            task_def,
        },
    };
    let wc = wc.start();
    wc.wait().await;
    println!("exiting");
}
