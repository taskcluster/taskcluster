//! Worker configuration types and loading.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::IpAddr;
use std::path::Path;
use std::sync::{Arc, RwLock};

/// Full worker configuration, combining public and private settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    // Private config
    #[serde(default)]
    pub access_token: String,
    #[serde(default)]
    pub certificate: String,

    // Public config
    #[serde(default = "default_allowed_high_memory_duration_secs")]
    pub allowed_high_memory_duration_secs: u64,
    #[serde(default)]
    pub availability_zone: String,
    #[serde(default = "default_caches_dir")]
    pub caches_dir: String,
    #[serde(default = "default_true")]
    pub clean_up_task_dirs: bool,
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub create_object_artifacts: bool,
    #[serde(default)]
    pub disable_oom_protection: bool,
    #[serde(default)]
    pub disable_reboots: bool,
    #[serde(default = "default_downloads_dir")]
    pub downloads_dir: String,
    #[serde(default)]
    pub ed25519_signing_key_location: String,
    #[serde(default)]
    pub enable_chain_of_trust: bool,
    #[serde(default)]
    pub enable_interactive: bool,
    #[serde(default = "default_true")]
    pub enable_live_log: bool,
    #[serde(default = "default_true")]
    pub enable_metadata: bool,
    #[serde(default = "default_true")]
    pub enable_mounts: bool,
    #[serde(default)]
    pub enable_os_groups: bool,
    #[serde(default)]
    pub enable_resource_monitor: bool,
    #[serde(default)]
    pub enable_taskcluster_proxy: bool,
    #[serde(default = "default_idle_timeout_secs")]
    pub idle_timeout_secs: u64,
    #[serde(default)]
    pub instance_id: String,
    #[serde(default)]
    pub instance_type: String,
    #[serde(default = "default_interactive_port")]
    pub interactive_port: u16,
    #[serde(default = "default_live_log_executable")]
    pub live_log_executable: String,
    #[serde(default = "default_live_log_port_base")]
    pub live_log_port_base: u16,
    #[serde(default = "default_live_log_expose_port")]
    pub live_log_expose_port: u16,
    #[serde(default = "default_max_memory_usage_percent")]
    pub max_memory_usage_percent: u64,
    #[serde(default = "default_max_task_run_time")]
    pub max_task_run_time: u32,
    #[serde(default = "default_min_available_memory_bytes")]
    pub min_available_memory_bytes: u64,
    #[serde(default = "default_number_of_tasks")]
    pub number_of_tasks_to_run: u64,
    #[serde(default)]
    pub private_ip: Option<IpAddr>,
    #[serde(default)]
    pub provisioner_id: String,
    #[serde(default)]
    pub public_ip: Option<IpAddr>,
    #[serde(default)]
    pub region: String,
    #[serde(default = "default_required_disk_space_megabytes")]
    pub required_disk_space_megabytes: u64,
    pub root_url: String,
    #[serde(default)]
    pub run_after_user_creation: String,
    #[serde(default)]
    pub sentry_project: String,
    #[serde(default)]
    pub shutdown_machine_on_idle: bool,
    #[serde(default)]
    pub shutdown_machine_on_internal_error: bool,
    #[serde(default = "default_taskcluster_proxy_executable")]
    pub taskcluster_proxy_executable: String,
    #[serde(default = "default_taskcluster_proxy_port")]
    pub taskcluster_proxy_port: u16,
    #[serde(default = "default_tasks_dir")]
    pub tasks_dir: String,
    #[serde(default)]
    pub worker_group: String,
    #[serde(default)]
    pub worker_id: String,
    #[serde(default)]
    pub worker_location: String,
    #[serde(default)]
    pub worker_type: String,
    #[serde(default)]
    pub worker_type_metadata: HashMap<String, serde_json::Value>,
    #[serde(default)]
    pub wst_audience: String,
    #[serde(default)]
    pub wst_server_url: String,

    // Platform-specific config (flattened)
    #[serde(default)]
    pub headless_tasks: bool,

    // D2G config
    #[serde(default)]
    pub enable_d2g: Option<bool>,
    #[serde(default)]
    pub disable_native_payloads: Option<bool>,

    // Loopback device config
    #[serde(default)]
    pub enable_loopback_audio: bool,
    #[serde(default)]
    pub enable_loopback_video: bool,
    #[serde(default)]
    pub loopback_audio_device_number: u32,
    #[serde(default)]
    pub loopback_video_device_number: u32,

    // Run-as-current-user feature (multiuser engine)
    #[serde(default)]
    pub enable_run_as_current_user: bool,

    // Windows-specific config
    #[serde(default)]
    pub enable_run_as_administrator: bool,

    // RDP feature config (Windows)
    #[serde(default)]
    pub enable_rdp: bool,
    #[serde(default)]
    pub rdp_info: String,
}

impl Config {
    /// Load configuration from a JSON file.
    pub fn from_file(path: &str) -> Result<Self> {
        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file: {path}"))?;
        let config: Config =
            serde_json::from_str(&content).with_context(|| "Failed to parse config JSON")?;
        Ok(config)
    }

    /// Validate the configuration, returning errors for missing required fields.
    pub fn validate(&self) -> Result<()> {
        if self.root_url.is_empty() {
            anyhow::bail!("rootURL must be set");
        }
        if self.client_id.is_empty() && self.access_token.is_empty() {
            // Credentials might come from worker-runner, so we don't error here
        }
        if self.provisioner_id.is_empty() {
            anyhow::bail!("provisionerID must be set");
        }
        if self.worker_type.is_empty() {
            anyhow::bail!("workerType must be set");
        }
        if self.worker_group.is_empty() {
            anyhow::bail!("workerGroup must be set");
        }
        if self.worker_id.is_empty() {
            anyhow::bail!("workerID must be set");
        }
        if self.tasks_dir.is_empty() {
            anyhow::bail!("tasksDir must be set");
        }
        Ok(())
    }

    /// Get Taskcluster credentials.
    pub fn credentials(&self) -> Credentials {
        Credentials {
            client_id: self.client_id.clone(),
            access_token: self.access_token.clone(),
            certificate: if self.certificate.is_empty() {
                None
            } else {
                Some(self.certificate.clone())
            },
        }
    }

    /// Check if D2G (Docker-to-Generic) payload conversion is enabled.
    pub fn d2g_enabled(&self) -> bool {
        self.enable_d2g.unwrap_or(false)
    }

    /// Check if native payloads are disabled.
    pub fn native_payloads_disabled(&self) -> bool {
        self.disable_native_payloads.unwrap_or(false)
    }

    /// Get the worker pool ID.
    pub fn worker_pool_id(&self) -> String {
        format!("{}/{}", self.provisioner_id, self.worker_type)
    }
}

/// Taskcluster credentials.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Credentials {
    pub client_id: String,
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub certificate: Option<String>,
}

/// Thread-safe configuration wrapper that supports credential updates.
#[derive(Debug, Clone)]
pub struct SharedConfig {
    inner: Arc<RwLock<Config>>,
}

impl SharedConfig {
    pub fn new(config: Config) -> Self {
        Self {
            inner: Arc::new(RwLock::new(config)),
        }
    }

    pub fn read(&self) -> std::sync::RwLockReadGuard<'_, Config> {
        self.inner.read().expect("config lock poisoned")
    }

    pub fn update_credentials(&self, creds: &Credentials) {
        let mut config = self.inner.write().expect("config lock poisoned");
        config.client_id = creds.client_id.clone();
        config.access_token = creds.access_token.clone();
        config.certificate = creds.certificate.clone().unwrap_or_default();
    }
}

/// Merge a secondary config (from worker-runner) into a primary config.
pub fn merge_configs(base: &mut Config, overlay: &serde_json::Value) -> Result<()> {
    let base_value = serde_json::to_value(&*base)?;
    let merged = merge_json_values(base_value, overlay.clone());
    *base = serde_json::from_value(merged)?;
    Ok(())
}

fn merge_json_values(base: serde_json::Value, overlay: serde_json::Value) -> serde_json::Value {
    use serde_json::Value;
    match (base, overlay) {
        (Value::Object(mut base_map), Value::Object(overlay_map)) => {
            for (key, overlay_val) in overlay_map {
                let merged = if let Some(base_val) = base_map.remove(&key) {
                    merge_json_values(base_val, overlay_val)
                } else {
                    overlay_val
                };
                base_map.insert(key, merged);
            }
            Value::Object(base_map)
        }
        (_, overlay) => overlay,
    }
}

/// Load config from file, optionally from a specific path.
pub fn load_config(path: &str) -> Result<Config> {
    if !Path::new(path).exists() {
        anyhow::bail!("Config file not found: {path}");
    }
    Config::from_file(path)
}

// Default value functions for serde

fn default_true() -> bool {
    true
}
fn default_caches_dir() -> String {
    "caches".to_string()
}
fn default_downloads_dir() -> String {
    "downloads".to_string()
}
fn default_tasks_dir() -> String {
    "tasks".to_string()
}
fn default_idle_timeout_secs() -> u64 {
    600
}
fn default_interactive_port() -> u16 {
    53765
}
fn default_live_log_executable() -> String {
    "livelog".to_string()
}
fn default_live_log_port_base() -> u16 {
    60098
}
fn default_live_log_expose_port() -> u16 {
    60099
}
fn default_max_memory_usage_percent() -> u64 {
    90
}
fn default_max_task_run_time() -> u32 {
    86400
}
fn default_min_available_memory_bytes() -> u64 {
    // 256 MiB
    256 * 1024 * 1024
}
fn default_number_of_tasks() -> u64 {
    0
}
fn default_required_disk_space_megabytes() -> u64 {
    10240
}
fn default_taskcluster_proxy_executable() -> String {
    "taskcluster-proxy".to_string()
}
fn default_taskcluster_proxy_port() -> u16 {
    80
}
fn default_allowed_high_memory_duration_secs() -> u64 {
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_configs() {
        let mut base = Config {
            root_url: "https://tc.example.com".to_string(),
            worker_id: "old-id".to_string(),
            ..serde_json::from_str(
                r#"{"rootUrl": "https://tc.example.com", "workerId": "old-id", "provisionerId": "p", "workerType": "t", "workerGroup": "g"}"#,
            )
            .unwrap()
        };
        let overlay = serde_json::json!({
            "workerId": "new-id",
            "region": "us-west-2"
        });
        merge_configs(&mut base, &overlay).unwrap();
        assert_eq!(base.worker_id, "new-id");
        assert_eq!(base.region, "us-west-2");
        assert_eq!(base.root_url, "https://tc.example.com");
    }

    #[test]
    fn test_validate_missing_root_url() {
        let config: Config = serde_json::from_str(r#"{"rootUrl": ""}"#).unwrap();
        assert!(config.validate().is_err());
    }
}
