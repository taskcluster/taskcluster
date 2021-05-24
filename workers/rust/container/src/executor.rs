use anyhow::Result;
use async_trait::async_trait;
use slog::{info, Logger};
use taskcluster::{ClientBuilder, Queue};
use taskcluster_lib_worker::claim::TaskClaim;
use taskcluster_lib_worker::executor::{Executor, TaskCommand};
use taskcluster_lib_worker::process::{Process, ProcessFactory};
use tokio::sync::mpsc;
use tokio::time;

/// An executor for container-worker tasks.
pub(crate) struct ContainerExecutor {
    root_url: String,
}

impl ContainerExecutor {
    pub(crate) fn new(root_url: String) -> Self {
        Self { root_url }
    }
}

impl Executor for ContainerExecutor {
    fn start_task(&mut self, logger: Logger, task_claim: TaskClaim) -> Process<TaskCommand> {
        let execution = ContainerExecution {
            logger,
            root_url: self.root_url.clone(),
            task_claim,
        };
        execution.start()
    }
}

/// An execution of a container-worker task.
struct ContainerExecution {
    logger: Logger,
    root_url: String,
    task_claim: TaskClaim,
}

#[async_trait]
impl ProcessFactory for ContainerExecution {
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

impl ContainerExecution {
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
