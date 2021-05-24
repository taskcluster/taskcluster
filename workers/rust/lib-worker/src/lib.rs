//! This library implements a collection of utilities for writing a Taskcluster worker in Rust,
//! supplementing the Rust client.
//!
//! * [`claim`] implements work claiming
//! * [`executor`] abstracts task execution
//! * [`process`] provides an abstraction for concurrent proceses
//!
//! A typical worker will start a [`claim::WorkClaimer`], passing it a custom
//! [`executor::Executor`] implementation.

pub mod claim;
pub mod executor;
pub mod process;

// TODO: basic docker support
// TODO: worker-runner protocol
// TODO: artifact support
// TODO: live-logging support (websocktunnel)
