//! Process execution and management.
//!
//! This module handles spawning and managing task command processes,
//! including platform-specific user switching and resource monitoring.

mod execute;
mod monitor;

#[cfg(unix)]
mod unix;
#[cfg(windows)]
mod windows;

pub use execute::{Command, CommandBuilder};

#[cfg(unix)]
pub use unix::PlatformData;
#[cfg(windows)]
pub use windows::PlatformData;

#[cfg(all(feature = "insecure", not(feature = "multiuser")))]
mod insecure;

#[cfg(all(feature = "multiuser", not(feature = "insecure")))]
mod multiuser;
#[cfg(all(feature = "multiuser", not(feature = "insecure")))]
pub use multiuser::new_platform_data;

#[cfg(target_os = "macos")]
pub mod darwin_agent;


/// Format a byte count as a human-readable string.
pub fn format_memory_string(bytes: u64) -> String {
    const KIB: u64 = 1024;
    const MIB: u64 = 1024 * KIB;
    const GIB: u64 = 1024 * MIB;

    if bytes >= GIB {
        format!("{:.2} GiB", bytes as f64 / GIB as f64)
    } else if bytes >= MIB {
        format!("{:.2} MiB", bytes as f64 / MIB as f64)
    } else if bytes >= KIB {
        format!("{:.2} KiB", bytes as f64 / KIB as f64)
    } else {
        format!("{bytes} B")
    }
}
