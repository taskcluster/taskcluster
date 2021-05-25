//! This module supports execution of tasks.  It handles
//!
//!  * deserializing the payload
//!  * reclaiming the task (TODO) and providing fresh task credentials
//!  * resolving the task
//!
//! The task is performed by an async function you provide.  It receives an ExecutionContext
//! as an argument, and returns a value indicating success or failure.  Any error return is
//! treated as an exception.
//!
//! See [`crate::claim`] for a simple example of an executor implementation.

mod execute;
mod payload;
mod types;

pub(crate) use execute::ExecutionFactory;
pub use payload::Payload;
pub use types::{ExecutionContext, Executor, Success};
