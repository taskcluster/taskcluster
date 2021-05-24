use crate::task::Task;
use anyhow::Result;
use async_trait::async_trait;
use bollard::Docker;
use slog::Logger;
use std::convert::TryFrom;
use std::sync::Arc;
use taskcluster_lib_worker::claim::TaskClaim;
use taskcluster_lib_worker::executor::TaskCommand;
use taskcluster_lib_worker::process::ProcessFactory;
use tokio::sync::mpsc;

/// An execution of a container-worker task.
pub(crate) struct ContainerExecution {
    logger: Logger,
    root_url: String,
    docker: Arc<Docker>,
    task_claim: TaskClaim,
}

impl ContainerExecution {
    pub(crate) fn new(
        logger: Logger,
        root_url: String,
        docker: Arc<Docker>,
        task_claim: TaskClaim,
    ) -> Self {
        Self {
            logger,
            root_url,
            docker,
            task_claim,
        }
    }
}

#[async_trait]
impl ProcessFactory for ContainerExecution {
    type Command = TaskCommand;

    async fn run(self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        let credentials = self.task_claim.credentials.clone();
        let task = Task::try_from(self.task_claim)?;
        tokio::select! {
            res = task.run(self.root_url, credentials, self.logger, self.docker) => { res }
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
