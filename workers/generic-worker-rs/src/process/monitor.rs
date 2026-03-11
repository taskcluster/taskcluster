//! Resource monitoring for running processes.
//!
//! Tracks system memory usage during task execution and can abort
//! tasks that exceed configured memory limits.

use std::time::{Duration, Instant};
use sysinfo::System;
use tokio::sync::{mpsc, watch};

/// Resource usage snapshot.
#[derive(Debug, Clone, Default)]
pub struct ResourceUsage {
    pub average_available_system_memory: u64,
    pub average_system_memory_used: u64,
    pub peak_system_memory_used: u64,
    pub total_system_memory: u64,
}

/// Configuration for resource monitoring.
pub struct MonitorResources {
    pub min_available_memory_bytes: u64,
    pub max_memory_usage_percent: u64,
    pub allowed_high_memory_duration: Duration,
    pub disable_oom_protection: bool,
}

impl MonitorResources {
    /// Create the resource monitor function that will be called by the command executor.
    pub fn create_monitor<F, G>(
        &self,
        warn: F,
        abort: G,
    ) -> impl FnOnce(mpsc::Sender<ResourceUsage>, watch::Receiver<bool>) + Send + 'static
    where
        F: Fn(String) + Send + 'static,
        G: Fn() + Send + 'static,
    {
        let min_bytes = self.min_available_memory_bytes;
        let max_percent = self.max_memory_usage_percent;
        let allowed_duration = self.allowed_high_memory_duration;
        let disable_oom = self.disable_oom_protection;

        move |usage_tx: mpsc::Sender<ResourceUsage>, mut done_rx: watch::Receiver<bool>| {
            tokio::spawn(async move {
                let mut sys = System::new_all();
                let mut samples: u64 = 0;
                let mut total_available: u64 = 0;
                let mut total_used: u64 = 0;
                let mut peak_used: u64 = 0;
                let mut high_memory_start: Option<Instant> = None;

                let interval = Duration::from_millis(500);

                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(interval) => {}
                        _ = done_rx.changed() => {
                            if *done_rx.borrow() {
                                // Send final usage
                                let total_memory = sys.total_memory();
                                let _ = usage_tx.send(ResourceUsage {
                                    average_available_system_memory: if samples > 0 { total_available / samples } else { 0 },
                                    average_system_memory_used: if samples > 0 { total_used / samples } else { 0 },
                                    peak_system_memory_used: peak_used,
                                    total_system_memory: total_memory,
                                }).await;
                                return;
                            }
                        }
                    }

                    sys.refresh_memory();
                    let total_memory = sys.total_memory();
                    let used_memory = sys.used_memory();
                    let available_memory = sys.available_memory();

                    samples += 1;
                    total_available += available_memory;
                    total_used += used_memory;
                    if used_memory > peak_used {
                        peak_used = used_memory;
                    }

                    // OOM protection check
                    if !disable_oom {
                        let usage_percent = if total_memory > 0 {
                            (used_memory * 100) / total_memory
                        } else {
                            0
                        };

                        let is_high = usage_percent >= max_percent
                            && available_memory < min_bytes;

                        if is_high {
                            if let Some(start) = high_memory_start {
                                if start.elapsed() >= allowed_duration {
                                    warn(format!(
                                        "Memory usage at {}% ({} available) for {:?} - aborting task",
                                        usage_percent,
                                        super::format_memory_string(available_memory),
                                        start.elapsed(),
                                    ));
                                    abort();
                                    return;
                                }
                            } else {
                                high_memory_start = Some(Instant::now());
                                warn(format!(
                                    "Memory usage at {}% ({} available) - monitoring",
                                    usage_percent,
                                    super::format_memory_string(available_memory),
                                ));
                            }
                        } else {
                            high_memory_start = None;
                        }
                    }
                }
            });
        }
    }
}
