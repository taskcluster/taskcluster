use crate::claim::TaskClaim;
use crate::process::Process;
use slog::Logger;

#[derive(Debug)]
pub enum Command {
    // TODO: is this needed?
}

/// An executor executes tasks.
pub trait Executor: 'static + Sync + Send {
    /// Start execution of the given task, returning the Process representing the execution.
    fn start_task(&mut self, logger: Logger, task_claim: TaskClaim) -> Process<Command>;
}
