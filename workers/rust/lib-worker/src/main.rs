use anyhow::Result;
use async_trait::async_trait;
use slog::{info, o, Drain, Logger};
use taskcluster::{ClientBuilder, Credentials, Queue};
use taskcluster_lib_worker::claim::{TaskClaim, WorkClaimer, WorkClaimerConfig};
use taskcluster_lib_worker::executor::{Executor, TaskCommand};
use taskcluster_lib_worker::process::{Process, ProcessFactory};
use tokio::sync::mpsc;
use tokio::time;

struct NullExecutor {
    root_url: String,
}

impl Executor for NullExecutor {
    fn start_task(&mut self, logger: Logger, task_claim: TaskClaim) -> Process<TaskCommand> {
        let execution = NullExecution {
            logger,
            root_url: self.root_url.clone(),
            task_claim,
        };
        execution.start()
    }
}

struct NullExecution {
    logger: Logger,
    root_url: String,
    task_claim: TaskClaim,
}

#[async_trait]
impl ProcessFactory for NullExecution {
    type Command = TaskCommand;

    async fn run(self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        tokio::select! {
            res = self.run_task() => { res }
            cmd = commands.recv() => {
                match cmd {
                    // on a stop request, bail out (dropping the task execution)
                    // TODO: mark task as worker-stopped
                    None => return Ok(()),
                    Some(_) => todo!(),
                }
            },
        }
    }
}

impl NullExecution {
    async fn run_task(self) -> Result<()> {
        let queue = Queue::new(
            ClientBuilder::new(&self.root_url).credentials(self.task_claim.credentials.clone()),
        )?;
        info!(self.logger, "executing null task");
        time::sleep(time::Duration::from_secs(1)).await;
        info!(self.logger, "completing null task");
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
    let decorator = slog_term::TermDecorator::new().build();
    let drain = slog_term::FullFormat::new(decorator).build().fuse();
    let drain = slog_async::Async::new(drain).build().fuse();

    let logger = Logger::root(drain, o!());

    info!(logger, "Starting Worker");

    let root_url = "https://dustin.taskcluster-dev.net";
    let wc = WorkClaimer::new(WorkClaimerConfig {
        logger: logger.clone(),
        root_url: root_url.to_owned(),
        worker_creds: Credentials::from_env().unwrap(),
        task_queue_id: "aa/bb".to_owned(),
        worker_group: "rust".to_owned(),
        worker_id: "worker".to_owned(),
        capacity: 4,
        executor: NullExecutor {
            root_url: root_url.to_owned(),
        },
    });
    let wc = wc.start();
    wc.await.unwrap();
}
