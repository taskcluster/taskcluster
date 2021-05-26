//! This library implements a collection of utilities for writing a Taskcluster worker in Rust,
//! supplementing the Rust client.
//!
//! * [`artifact`] implements interfacing with artifacts
//! * [`claim`] implements work claiming
//! * [`execute`] abstracts task execution
//! * [`log`] provides support for the task log
//! * [`process`] provides an abstraction for concurrent proceses
//! * [`task`] provides a deserializable task struct, with some useful utilities
//! * [`tc`] provides support for calling Taskcluster APIs
//! * [`testing`] provides support for testing workers (only available in debug builds)
//!
//! A typical worker will start a [`claim::WorkClaimer`], passing it a custom
//! [`execute::Executor`] implementation.

pub mod artifact;
pub mod claim;
pub mod execute;
pub mod log;
pub mod process;
pub mod task;
pub mod tc;

#[cfg(debug_assertions)]
pub mod testing;

#[cfg(test)]
mod test;
