use crate::execute::Payload;
use crate::log::TaskLog;
use crate::task::Task;
use crate::tc::ServiceFactory;
use anyhow::Result;
use async_trait::async_trait;
use slog::Logger;
use std::sync::Arc;

/// An executor is an object that knows how to execute tasks; it is the main trait to implement
/// to use this crate.
#[async_trait]
pub trait Executor<P: Payload>: 'static + Sync + Send {
    async fn execute(&self, ctx: ExecutionContext<P>) -> Result<Success, anyhow::Error>;
}

/// Context for an execution.  In effect, this struct represents keyword arguments for
/// [`Executor::execute`], allowing additional arguments to be added later.
pub struct ExecutionContext<P: Payload> {
    pub task_id: String,
    pub run_id: u32,
    pub task_def: Task,
    pub payload: P,
    pub logger: Logger,
    pub service_factory: Arc<dyn ServiceFactory>,
    pub task_log: TaskLog,
}

/// Result of a task execution that did not encounter any unexpected errors.
#[derive(Debug, PartialEq)]
pub enum Success {
    /// Task succeeded
    Succeeded,
    /// Task failed normally,
    Failed,
}
