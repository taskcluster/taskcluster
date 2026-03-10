//! Task payload and model types.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The Generic Worker task payload.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenericWorkerPayload {
    /// Artifacts to publish after task completes.
    #[serde(default)]
    pub artifacts: Vec<ArtifactDefinition>,

    /// Commands to execute. Each element is a command with arguments.
    #[serde(default)]
    pub command: Vec<Vec<String>>,

    /// Environment variables to set for command execution.
    #[serde(default)]
    pub env: HashMap<String, String>,

    /// Feature flags for optional task functionality.
    #[serde(default)]
    pub features: FeatureFlags,

    /// Log artifact configuration.
    #[serde(default)]
    pub logs: LogConfig,

    /// Maximum time (in seconds) the task may run.
    #[serde(default = "default_max_run_time")]
    pub max_run_time: i64,

    /// Mount definitions (caches, read-only directories, files).
    #[serde(default)]
    pub mounts: Vec<serde_json::Value>,

    /// Exit code handling for retry/purge decisions.
    #[serde(default)]
    pub on_exit_status: ExitCodeHandling,

    /// OS groups to add the task user to.
    #[serde(default)]
    pub os_groups: Vec<String>,

    /// URL to check for superseding tasks.
    #[serde(default)]
    pub superseder_url: String,

    /// Network interface for taskcluster-proxy binding.
    #[serde(default = "default_proxy_interface")]
    pub taskcluster_proxy_interface: String,

    /// RDP info artifact name (Windows only, set when RDP access is requested).
    #[serde(default)]
    pub rdp_info: String,
}

impl Default for GenericWorkerPayload {
    fn default() -> Self {
        Self {
            artifacts: Vec::new(),
            command: Vec::new(),
            env: HashMap::new(),
            features: FeatureFlags::default(),
            logs: LogConfig::default(),
            max_run_time: default_max_run_time(),
            mounts: Vec::new(),
            on_exit_status: ExitCodeHandling::default(),
            os_groups: Vec::new(),
            superseder_url: String::new(),
            taskcluster_proxy_interface: default_proxy_interface(),
            rdp_info: String::new(),
        }
    }
}

/// Feature flags that can be enabled per-task.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeatureFlags {
    #[serde(default = "default_true")]
    pub backing_log: bool,
    #[serde(default)]
    pub interactive: bool,
    #[serde(default)]
    pub live_log: bool,
    #[serde(default)]
    pub loopback_audio: bool,
    #[serde(default)]
    pub loopback_video: bool,
    #[serde(default)]
    pub resource_monitor: bool,
    #[serde(default)]
    pub taskcluster_proxy: bool,
    #[serde(default)]
    pub run_as_current_user: bool,
    /// Run task commands with an elevated (administrator) token (Windows only).
    #[serde(default)]
    pub run_as_administrator: Option<bool>,
    /// Hide the cmd.exe window when running commands (Windows only).
    #[serde(default)]
    pub hide_cmd_window: bool,
}

/// Configuration for log artifacts.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogConfig {
    /// Name of the backing log artifact.
    #[serde(default = "default_backing_log")]
    pub backing: String,
    /// Name of the live log artifact.
    #[serde(default = "default_live_log")]
    pub live: String,
}

impl Default for LogConfig {
    fn default() -> Self {
        Self {
            backing: default_backing_log(),
            live: default_live_log(),
        }
    }
}

/// Exit code handling configuration.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExitCodeHandling {
    /// Exit codes that trigger cache purging.
    #[serde(default)]
    pub purge_caches: Vec<i64>,
    /// Exit codes that trigger task retry.
    #[serde(default)]
    pub retry: Vec<i64>,
}

/// Definition of an artifact to upload.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactDefinition {
    /// Content encoding (e.g., "gzip").
    #[serde(default)]
    pub content_encoding: String,
    /// MIME content type.
    #[serde(default)]
    pub content_type: String,
    /// Artifact expiry time.
    #[serde(default)]
    pub expires: Option<DateTime<Utc>>,
    /// Artifact name (path in the artifact namespace).
    /// Defaults to the path if not specified.
    #[serde(default)]
    pub name: String,
    /// Whether the artifact is optional (no error if missing).
    #[serde(default)]
    pub optional: bool,
    /// Path to the file/directory on disk.
    pub path: String,
    /// Artifact type: "file" or "directory".
    #[serde(rename = "type")]
    pub artifact_type: String,
}

/// Task definition as received from the Queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDefinitionResponse {
    pub task_group_id: String,
    #[serde(default)]
    pub provisioner_id: String,
    #[serde(default)]
    pub worker_type: String,
    pub payload: serde_json::Value,
    pub metadata: TaskMetadata,
    pub expires: DateTime<Utc>,
    pub deadline: DateTime<Utc>,
    pub scopes: Vec<String>,
    #[serde(default)]
    pub dependencies: Vec<String>,
    #[serde(default)]
    pub tags: HashMap<String, String>,
    #[serde(default)]
    pub extra: serde_json::Value,
}

/// Task metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskMetadata {
    pub name: String,
    pub description: String,
    pub owner: String,
    pub source: String,
}

/// Response from claiming a task.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskClaimResponse {
    pub status: TaskStatusStructure,
    pub run_id: u32,
    pub task: TaskDefinitionResponse,
    pub credentials: TaskCredentials,
    pub taken_until: DateTime<Utc>,
}

/// Response from reclaiming a task.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskReclaimResponse {
    pub status: TaskStatusStructure,
    pub run_id: u32,
    pub credentials: TaskCredentials,
    pub taken_until: DateTime<Utc>,
}

/// Task status structure from the Queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatusStructure {
    pub task_id: String,
    pub provisioner_id: String,
    pub worker_type: String,
    pub scheduler_id: String,
    pub task_group_id: String,
    pub state: String,
    pub runs: Vec<RunInfo>,
}

/// Information about a single run of a task.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunInfo {
    pub run_id: u32,
    pub state: String,
    #[serde(default)]
    pub reason_created: String,
    #[serde(default)]
    pub reason_resolved: String,
    #[serde(default)]
    pub started: Option<DateTime<Utc>>,
    #[serde(default)]
    pub resolved: Option<DateTime<Utc>>,
    #[serde(default)]
    pub taken_until: Option<DateTime<Utc>>,
    #[serde(default)]
    pub worker_group: String,
    #[serde(default)]
    pub worker_id: String,
}

/// Credentials for a claimed task.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCredentials {
    pub client_id: String,
    pub access_token: String,
    #[serde(default)]
    pub certificate: String,
}

/// ClaimWork request body.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimWorkRequest {
    pub tasks: u32,
    pub worker_group: String,
    pub worker_id: String,
}

/// ClaimWork response body.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaimWorkResponse {
    pub tasks: Vec<TaskClaimResponse>,
}

/// Worker status for the /worker-status endpoint.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkerStatus {
    pub current_task_ids: Vec<String>,
}

/// Metadata artifact written at end of task.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataInfo {
    pub last_task_url: String,
}

/// Mount types that can appear in payload.mounts.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileMountPayload {
    pub content: serde_json::Value,
    pub file: String,
    #[serde(default)]
    pub format: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WritableDirectoryCachePayload {
    pub cache_name: String,
    #[serde(default)]
    pub content: Option<serde_json::Value>,
    pub directory: String,
    #[serde(default)]
    pub format: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadOnlyDirectoryPayload {
    pub content: serde_json::Value,
    pub directory: String,
    #[serde(default)]
    pub format: String,
}

/// Content source types for mounts.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactContentPayload {
    pub task_id: String,
    pub artifact: String,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedContentPayload {
    pub namespace: String,
    pub artifact: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UrlContentPayload {
    pub url: String,
    #[serde(default)]
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawContentPayload {
    pub raw: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Base64ContentPayload {
    pub base64: String,
}

/// Returns the JSON schema for the generic worker payload.
pub fn payload_schema_json() -> String {
    // TODO: Generate this from YAML schema definitions
    serde_json::json!({
        "type": "object",
        "title": "Generic Worker Payload",
        "description": "Task payload for the Taskcluster Generic Worker",
        "properties": {
            "command": {
                "type": "array",
                "minItems": 1,
                "items": {
                    "type": "array",
                    "items": { "type": "string" }
                },
                "description": "Commands to execute"
            },
            "maxRunTime": {
                "type": "integer",
                "minimum": 1,
                "description": "Maximum time in seconds for the task to run"
            },
            "env": {
                "type": "object",
                "additionalProperties": { "type": "string" },
                "description": "Environment variables"
            },
            "artifacts": {
                "type": "array",
                "description": "Artifacts to upload after task completion"
            },
            "mounts": {
                "type": "array",
                "description": "File and directory mounts"
            },
            "features": {
                "type": "object",
                "description": "Feature flags"
            },
            "logs": {
                "type": "object",
                "description": "Log configuration"
            },
            "onExitStatus": {
                "type": "object",
                "description": "Exit code handling"
            },
            "osGroups": {
                "type": "array",
                "items": { "type": "string" },
                "description": "OS groups to add task user to"
            },
            "supersederUrl": {
                "type": "string",
                "description": "URL to check for superseding tasks"
            },
            "taskclusterProxyInterface": {
                "type": "string",
                "description": "Network interface for taskcluster-proxy"
            },
            "rdpInfo": {
                "type": "string",
                "description": "RDP info artifact name"
            }
        },
        "required": ["command", "maxRunTime"]
    })
    .to_string()
}

// Default value helper functions

fn default_true() -> bool {
    true
}

fn default_max_run_time() -> i64 {
    3600
}

fn default_proxy_interface() -> String {
    "localhost".to_string()
}

fn default_backing_log() -> String {
    "public/logs/live_backing.log".to_string()
}

fn default_live_log() -> String {
    "public/logs/live.log".to_string()
}
