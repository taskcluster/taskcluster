//! Taskcluster Generic Worker library crate.
//!
//! Re-exports internal modules for use by integration tests. The binary
//! entry point lives in main.rs.

pub mod config;
pub mod engine;
pub mod errorreport;
pub mod errors;
pub mod expose;
pub mod gdm3;
pub mod graceful;
pub mod interactive;
#[cfg(target_os = "macos")]
pub mod kc;
pub mod livelog;
pub mod logininfo;
pub mod metrics;
pub mod sentry;
pub mod workerproto;

// Windows API wrappers.
#[cfg(target_os = "windows")]
pub mod win32;

// Modules needed internally and selectively re-exported.
mod artifacts;
mod features;
mod fileutil;
mod garbagecollector;
mod host;
pub mod model;
pub mod multiuser;
mod process;
mod resolvetask;
pub mod runtime;
mod taskstatus;
mod tc;
mod tcproxy;
pub mod worker;

#[cfg(test)]
pub mod mock_tc;
