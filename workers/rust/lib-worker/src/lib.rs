//! This library implements a collection of utilities for writing a Taskcluster worker in Rust,
//! supplementing the Rust client.
//!
//! * [`claim`] implements work claiming
//! * [`executor`] abstracts task execution
//! * [`process`] provides an abstraction for concurrent proceses
//! * [`task`] provides a deserializable task struct, with some useful utilities
//!
//! A typical worker will start a [`claim::WorkClaimer`], passing it a custom
//! [`executor::Executor`] implementation.

pub mod claim;
pub mod executor;
pub mod process;
pub mod task;

// TODO: basic docker support
// TODO: worker-runner protocol
// TODO: artifact support
// TODO: live-logging support (websocktunnel)
// TODO: move more of executor into lib-worker, to handle creds rotation, posting status, artifact upload, etc.
// TODO: testing utilities
