//! This module provides support for calling Taskcluster APIs, with a few twists:
//!
//! * Support for asynchronously refreshing credentials (such as for worker creds and task creds)
//! * Support for injecting fake implementations to support testing worker implementations

mod creds_container;
mod services;

pub(crate) use creds_container::CredsContainer;
pub use services::{QueueService, ServiceFactory};

#[cfg(debug_assertions)]
pub use services::TestServiceFactory;
