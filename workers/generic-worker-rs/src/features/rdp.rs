//! RDP (Remote Desktop Protocol) feature - Windows only.
//!
//! When enabled, this feature creates an RDP info artifact containing
//! connection details (host, port, username, password) and sleeps for
//! 12 hours after the task completes, allowing remote desktop access.
//!
//! Ported from Go `rdp_feature_windows.go`.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct RDPFeature;

impl RDPFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for RDPFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_rdp
    }

    /// RDP is only enabled when task.payload.rdpInfo is set.
    fn is_requested(&self, task: &TaskRun) -> bool {
        !task.payload.rdp_info.is_empty()
    }

    fn rejects_when_disabled(&self) -> bool {
        true
    }

    fn new_task_feature(&self, task: &TaskRun, config: &Config) -> Box<dyn TaskFeature> {
        Box::new(RDPTaskFeature {
            task_id: task.task_id.clone(),
            provisioner_id: task.definition.provisioner_id.clone(),
            worker_type: task.definition.worker_type.clone(),
            rdp_info_artifact_name: task.payload.rdp_info.clone(),
            task_dir: task.task_dir.clone(),
            public_ip: config.public_ip,
        })
    }

    fn name(&self) -> &'static str {
        "RDP"
    }
}

struct RDPTaskFeature {
    task_id: String,
    provisioner_id: String,
    worker_type: String,
    rdp_info_artifact_name: String,
    task_dir: std::path::PathBuf,
    public_ip: Option<std::net::IpAddr>,
}

/// RDP connection info written as a JSON artifact.
#[derive(Debug, serde::Serialize)]
struct RDPInfo {
    host: Option<std::net::IpAddr>,
    port: u16,
    username: String,
    password: String,
}

impl TaskFeature for RDPTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        vec![vec![format!(
            "generic-worker:allow-rdp:{}/{}",
            self.provisioner_id, self.worker_type,
        )]]
    }

    fn reserved_artifacts(&self) -> Vec<String> {
        vec![self.rdp_info_artifact_name.clone()]
    }

    #[cfg(target_os = "windows")]
    fn start(&mut self) -> Option<CommandExecutionError> {
        if let Err(e) = self.create_and_upload_rdp_artifact() {
            tracing::error!("Failed to create RDP artifact: {}", e);
            return Some(crate::errors::internal_error(e));
        }
        None
    }

    #[cfg(not(target_os = "windows"))]
    fn start(&mut self) -> Option<CommandExecutionError> {
        // RDP feature is only functional on Windows.
        // On other platforms, log a warning and continue.
        tracing::warn!("RDP feature is only supported on Windows");
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // Sleep for 12 hours to keep the machine available for RDP access,
        // matching the Go implementation exactly.
        #[cfg(target_os = "windows")]
        {
            tracing::info!(
                "RDP feature: sleeping for 12 hours to allow remote access to task {}",
                self.task_id,
            );
            std::thread::sleep(std::time::Duration::from_secs(12 * 60 * 60));
        }
        #[cfg(not(target_os = "windows"))]
        {
            tracing::warn!(
                "RDP feature stop called on non-Windows platform for task {}",
                self.task_id,
            );
        }
    }
}

impl RDPTaskFeature {
    #[cfg(target_os = "windows")]
    fn create_and_upload_rdp_artifact(&self) -> anyhow::Result<()> {
        let rdp_info_path = self.task_dir.join("generic-worker").join("rdp.json");

        // Ensure parent directory exists
        if let Some(parent) = rdp_info_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let info = RDPInfo {
            host: self.public_ip,
            port: 3389,
            // In the full implementation, username and password would come from
            // the task context user. For now, use placeholder values that will
            // be filled in when task environment integration is complete.
            username: String::new(),
            password: String::new(),
        };

        let json = serde_json::to_string_pretty(&info)?;
        std::fs::write(&rdp_info_path, json)?;

        tracing::info!(
            "Created RDP info artifact at {}",
            rdp_info_path.display()
        );

        // The actual artifact upload will be handled by the artifact upload
        // feature infrastructure using the reserved artifact name.
        Ok(())
    }
}
