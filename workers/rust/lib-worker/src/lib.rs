//! This library implements a collection of utilities for writing a Taskcluster worker in Rust,
//! supplementing the Rust client.
//!
//! * [`claim`] implements work claiming
//! * [`execute`] abstracts task execution
//! * [`process`] provides an abstraction for concurrent proceses
//! * [`task`] provides a deserializable task struct, with some useful utilities
//!
//! A typical worker will start a [`claim::WorkClaimer`], passing it a custom
//! [`execute::Executor`] implementation.

pub mod claim;
pub mod execute;
pub mod process;
pub mod task;
