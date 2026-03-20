//! Loopback audio feature - provides a virtual audio device for tasks.
//!
//! On Linux, this loads the snd-aloop kernel module to create a virtual
//! loopback audio device that tasks can use for audio recording/playback
//! testing. On other platforms this feature is a no-op stub.
//!
//! Required scopes: generic-worker:loopback-audio:{provisionerId}/{workerType}

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct LoopbackAudioFeature {
    provisioner_id: String,
    worker_type: String,
}

impl LoopbackAudioFeature {
    pub fn new() -> Self {
        Self {
            provisioner_id: String::new(),
            worker_type: String::new(),
        }
    }
}

impl Feature for LoopbackAudioFeature {
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()> {
        self.provisioner_id = config.provisioner_id.clone();
        self.worker_type = config.worker_type.clone();
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_loopback_audio
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.loopback_audio
    }

    fn new_task_feature(&self, _task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(LoopbackAudioTaskFeature {
            provisioner_id: self.provisioner_id.clone(),
            worker_type: self.worker_type.clone(),
            #[cfg(target_os = "linux")]
            device_number: 0,
        })
    }

    fn name(&self) -> &'static str {
        "LoopbackAudio"
    }
}

struct LoopbackAudioTaskFeature {
    provisioner_id: String,
    worker_type: String,
    #[cfg(target_os = "linux")]
    device_number: u32,
}

impl TaskFeature for LoopbackAudioTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        vec![vec![format!(
            "generic-worker:loopback-audio:{}/{}",
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
            tracing::warn!("LoopbackAudio: not supported on this platform, skipping");
        }

        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // The kernel module persists across tasks; no cleanup needed.
        tracing::info!("LoopbackAudio feature stopped");
    }
}

#[cfg(target_os = "linux")]
impl LoopbackAudioTaskFeature {
    fn start_linux(&mut self) -> anyhow::Result<()> {
        use std::process::Command;

        // Load the snd-aloop kernel module if not already loaded.
        let status = Command::new("modprobe").arg("snd-aloop").status();

        match status {
            Ok(s) if s.success() => {
                tracing::info!("LoopbackAudio: loaded snd-aloop kernel module");
            }
            Ok(s) => {
                anyhow::bail!(
                    "LoopbackAudio: modprobe snd-aloop exited with status {}",
                    s
                );
            }
            Err(e) => {
                anyhow::bail!("LoopbackAudio: failed to run modprobe: {}", e);
            }
        }

        // Set device permissions so the task user can access the audio device.
        let device_path = format!("/dev/snd/controlC{}", self.device_number);
        let pcm_playback = format!("/dev/snd/pcmC{}D0p", self.device_number);
        let pcm_capture = format!("/dev/snd/pcmC{}D0c", self.device_number);

        for path in &[&device_path, &pcm_playback, &pcm_capture] {
            let dev = std::path::Path::new(path);
            if dev.exists() {
                let status = Command::new("chmod").args(["0666", path]).status();
                match status {
                    Ok(s) if s.success() => {
                        tracing::debug!("LoopbackAudio: set permissions on {}", path);
                    }
                    _ => {
                        tracing::warn!("LoopbackAudio: failed to set permissions on {}", path);
                    }
                }
            }
        }

        tracing::info!("LoopbackAudio: virtual audio device ready");
        Ok(())
    }
}
