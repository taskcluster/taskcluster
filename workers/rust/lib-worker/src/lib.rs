//! This library implements a collection of utilities for writing a Taskcluster worker in Rust,
//! supplementing the Rust client.
//!
//! * [`claim`] implements work claiming
//! * [`execute`] abstracts task execution
//! * [`log`] provides support for the task log
//! * [`process`] provides an abstraction for concurrent proceses
//! * [`task`] provides a deserializable task struct, with some useful utilities
//! * [`tc`] provides support for calling Taskcluster APIs
//!
//! A typical worker will start a [`claim::WorkClaimer`], passing it a custom
//! [`execute::Executor`] implementation.

pub mod claim;
pub mod execute;
pub mod log;
pub mod process;
pub mod task;
pub mod tc;

#[cfg(test)]
mod test;
