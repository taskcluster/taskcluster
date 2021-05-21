use anyhow::Result;
use async_trait::async_trait;
use taskcluster::{ClientBuilder, Credentials, Queue};
use taskcluster_lib_worker::claim::{TaskClaim, WorkClaimer, WorkClaimerConfig};
use taskcluster_lib_worker::executor::{self, Executor};
use taskcluster_lib_worker::process::{Process, ProcessFactory};
use tokio::sync::mpsc;

struct NullExecutor {
    root_url: String,
}

impl Executor for NullExecutor {
    fn start_task(&mut self, task_claim: TaskClaim) -> Process<executor::Command> {
        let execution = NullExecution {
            root_url: self.root_url.clone(),
            task_claim,
        };
        execution.start()
    }
}

struct NullExecution {
    root_url: String,
    task_claim: TaskClaim,
}

#[async_trait]
impl ProcessFactory for NullExecution {
    type Command = executor::Command;

    async fn run(self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        tokio::select! {
            res = self.run_task() => { res }
            // on stop, return immediately (dropping the task execution)
            // TODO: mark as worker-shutdown?
            None = commands.recv() => { Ok(()) },
        }
    }
}

impl NullExecution {
    async fn run_task(self) -> Result<()> {
        let queue = Queue::new(
            ClientBuilder::new(&self.root_url).credentials(self.task_claim.credentials.clone()),
        )?;
        log::info!(
            "executing null {:?} / {}",
            self.task_claim.task_id,
            self.task_claim.run_id
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
    env_logger::init();

    let root_url = "https://dustin.taskcluster-dev.net";
    let wc = WorkClaimer::new(WorkClaimerConfig {
        capacity: 4,
        root_url: root_url.to_owned(),
        worker_creds: Credentials::from_env().unwrap(),
        task_queue_id: "aa/bb".to_owned(),
        worker_group: "rust".to_owned(),
        worker_id: "worker".to_owned(),
        executor: NullExecutor {
            root_url: root_url.to_owned(),
        },
    });
    let wc = wc.start();
    wc.await.unwrap();
    log::info!("exiting");
}
