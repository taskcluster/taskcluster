//! This module provides support for calling Taskcluster APIs, with a few twists:
//!
//! * Support for asynchronously refreshing credentials (such as for worker creds and task creds)
//! * Support for injecting fake implementations to support testing worker implementations

mod creds_container;
mod queue;

pub(crate) use creds_container::CredsContainer;
pub use queue::{QueueFactory, QueueService};
