use anyhow::Result;
use async_trait::async_trait;
use taskcluster::{ClientBuilder, Credentials, Queue};
use taskcluster_lib_worker::claim::{TaskClaim, TaskExecutor, WorkClaimer};
use taskcluster_lib_worker::process::ProcessFactory;

struct NullWorker {
    root_url: String,
    task_claim: TaskClaim,
}

#[async_trait]
impl TaskExecutor for NullWorker {
    async fn execute_task(self) -> Result<()> {
        let queue = Queue::new(
            ClientBuilder::new(&self.root_url).credentials(self.task_claim.credentials.clone()),
        )?;
        println!(
            "execute {:?} / {}",
            self.task_claim.task_id, self.task_claim.run_id
        );
        dbg!(&self.task_claim.task.get("payload").unwrap());
        queue
            .reportCompleted(
                &self.task_claim.task_id,
                &format!("{}", self.task_claim.run_id),
            )
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
        executor_factory: |root_url, task_claim| NullWorker {
            root_url,
            task_claim,
        },
        running: vec![],
    };
    let mut wc = wc.start();
    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
    println!("stopping");
    wc.stop().await.unwrap();
    wc.wait().await.unwrap();
    println!("exiting");
}

// TODO: logging
