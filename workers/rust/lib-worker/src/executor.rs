use crate::claim::TaskClaim;
use crate::process::{Process, ProcessFactory};
use anyhow::Result;
use async_trait::async_trait;
use slog::Logger;
use tokio::sync::mpsc;

/// TaskCommands are commands sent to tasks
#[derive(Debug)]
pub enum TaskCommand {
    // TODO: Credentials(new_creds)
}

/// An executor executes tasks.  Given a task claim, and a logger for the task, it creates
/// a process representing that task.
pub trait Executor: 'static + Sync + Send {
    /// Execute the given task, returning the Process representing the execution.
    fn execute(&mut self, logger: Logger, task_claim: TaskClaim) -> Process<()> {
        ExecutionFactory {
            logger: logger.clone(),
            task_process: self.start_task(logger, task_claim),
        }
        .start()
    }

    /// Start execution of the given task.  The returned process will be sent new task credentials
    /// as appropriate.
    fn start_task(&mut self, logger: Logger, task_claim: TaskClaim) -> Process<TaskCommand>;
}

struct ExecutionFactory {
    #[allow(dead_code)]
    logger: Logger,
    task_process: Process<TaskCommand>,
}

#[async_trait]
impl ProcessFactory for ExecutionFactory {
    type Command = ();
    async fn run(self, _commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        // TODO: wait for creds to expire, renew, and send those to self.task_process
        self.task_process.await
    }
}
