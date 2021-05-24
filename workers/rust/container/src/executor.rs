use crate::execution::ContainerExecution;
use bollard::Docker;
use slog::Logger;
use std::sync::Arc;
use taskcluster_lib_worker::claim::TaskClaim;
use taskcluster_lib_worker::executor::{Executor, TaskCommand};
use taskcluster_lib_worker::process::{Process, ProcessFactory};

/// An executor for container-worker tasks.
pub(crate) struct ContainerExecutor {
    root_url: String,
    docker: Arc<Docker>,
}

impl ContainerExecutor {
    pub(crate) fn new(root_url: String, docker: Docker) -> Self {
        Self {
            root_url,
            docker: Arc::new(docker),
        }
    }
}

impl Executor for ContainerExecutor {
    fn start_task(&mut self, logger: Logger, task_claim: TaskClaim) -> Process<TaskCommand> {
        let execution = ContainerExecution::new(
            logger,
            self.root_url.clone(),
            self.docker.clone(),
            task_claim,
        );
        execution.start()
    }
}
