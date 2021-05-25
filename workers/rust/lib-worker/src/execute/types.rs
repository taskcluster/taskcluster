use crate::execute::Payload;
use crate::task::Task;
use anyhow::Result;
use async_trait::async_trait;
use slog::Logger;
use std::sync::Arc;
use taskcluster::Queue;

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
    pub root_url: String,
    pub queue_factory: Box<dyn QueueFactory>,
}

/// Result of a task execution that did not encounter any unexpected errors.
pub enum Success {
    /// Task succeeded
    Succeeded,
    /// Task failed normally,
    Failed,
}

/// A QueueFactory can efficiently supply Queue instances on-demand.  Call this each time
/// you need a queue, rather than caching the value for any length of time, to allow new
/// instances to be created.  This trait is also a useful point for depnedency injection
/// in tests.
pub trait QueueFactory: 'static + Sync + Send {
    fn queue(&self) -> anyhow::Result<Arc<Queue>>;
}
