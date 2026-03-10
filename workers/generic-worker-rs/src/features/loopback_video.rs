//! Loopback video feature - provides a virtual video device for tasks.
//!
//! On Linux, this loads the v4l2loopback kernel module to create a virtual
//! video device that tasks can use for video capture testing. The device path
//! is exported via the TASKCLUSTER_VIDEO_DEVICE environment variable.
//! On other platforms this feature is a no-op stub.
//!
//! Required scopes: generic-worker:loopback-video:{provisionerId}/{workerType}

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct LoopbackVideoFeature {
    provisioner_id: String,
    worker_type: String,
}

impl LoopbackVideoFeature {
    pub fn new() -> Self {
        Self {
            provisioner_id: String::new(),
            worker_type: String::new(),
        }
    }
}

impl Feature for LoopbackVideoFeature {
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()> {
        self.provisioner_id = config.provisioner_id.clone();
        self.worker_type = config.worker_type.clone();
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_loopback_video
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.loopback_video
    }

    fn new_task_feature(&self, _task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(LoopbackVideoTaskFeature {
            provisioner_id: self.provisioner_id.clone(),
            worker_type: self.worker_type.clone(),
            #[cfg(target_os = "linux")]
            device_number: 0,
        })
    }

    fn name(&self) -> &'static str {
        "LoopbackVideo"
    }
}

struct LoopbackVideoTaskFeature {
    provisioner_id: String,
    worker_type: String,
    #[cfg(target_os = "linux")]
    device_number: u32,
}

impl TaskFeature for LoopbackVideoTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        vec![vec![format!(
            "generic-worker:loopback-video:{}/{}",
            self.provisioner_id, self.worker_type
        )]]
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        #[cfg(target_os = "linux")]
        {
            if let Err(e) = self.start_linux() {
                return Some(crate::errors::internal_error(e));
            }
        }

        #[cfg(not(target_os = "linux"))]
        {
            tracing::warn!("LoopbackVideo: not supported on this platform, skipping");
        }

        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // The kernel module persists across tasks; no cleanup needed.
        tracing::info!("LoopbackVideo feature stopped");
    }
}

#[cfg(target_os = "linux")]
impl LoopbackVideoTaskFeature {
    fn start_linux(&mut self) -> anyhow::Result<()> {
        use std::process::Command;

        // Load the v4l2loopback kernel module if not already loaded.
        let device_number_arg = format!("video_nr={}", self.device_number);
        let status = Command::new("modprobe")
            .args(["v4l2loopback", &device_number_arg])
            .status();

        match status {
            Ok(s) if s.success() => {
                tracing::info!("LoopbackVideo: loaded v4l2loopback kernel module");
            }
            Ok(s) => {
                anyhow::bail!(
                    "LoopbackVideo: modprobe v4l2loopback exited with status {}",
                    s
                );
            }
            Err(e) => {
                anyhow::bail!("LoopbackVideo: failed to run modprobe: {}", e);
            }
        }

        // Set device permissions so the task user can access the video device.
        let device_path = format!("/dev/video{}", self.device_number);
        let dev = std::path::Path::new(&device_path);
        if dev.exists() {
            let status = Command::new("chmod")
                .args(["0666", &device_path])
                .status();
            match status {
                Ok(s) if s.success() => {
                    tracing::debug!("LoopbackVideo: set permissions on {}", device_path);
                }
                _ => {
                    tracing::warn!(
                        "LoopbackVideo: failed to set permissions on {}",
                        device_path
                    );
                }
            }
        }

        // Set the TASKCLUSTER_VIDEO_DEVICE environment variable so the task
        // knows which device to use.
        std::env::set_var("TASKCLUSTER_VIDEO_DEVICE", &device_path);
        tracing::info!(
            "LoopbackVideo: virtual video device ready at {}",
            device_path
        );

        Ok(())
    }
}
