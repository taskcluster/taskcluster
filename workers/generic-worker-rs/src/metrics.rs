//! Worker metrics logging.
//!
//! Logs structured WORKER_METRICS events as JSON. This is a faithful port of
//! the Go `metrics.go` module.

use chrono::{DateTime, Utc};

use crate::config::Config;

/// Information about a task, used to attach taskId/runId to metric events.
pub struct TaskInfo<'a> {
    pub task_id: &'a str,
    pub run_id: u32,
}

/// Log a structured WORKER_METRICS event.
///
/// Emits a JSON-encoded log line with the given `event_type`, worker
/// identity fields from `config`, a Unix timestamp, and optional task
/// information. The format matches the Go implementation exactly:
///
/// ```text
/// WORKER_METRICS {"eventType":"...","worker":"generic-worker",...}
/// ```
pub fn log_event(
    event_type: &str,
    config: &Config,
    task: Option<&TaskInfo<'_>>,
    timestamp: DateTime<Utc>,
) {
    let mut fields = serde_json::Map::new();
    fields.insert(
        "eventType".to_string(),
        serde_json::Value::String(event_type.to_string()),
    );
    fields.insert(
        "worker".to_string(),
        serde_json::Value::String("generic-worker".to_string()),
    );
    fields.insert(
        "workerPoolId".to_string(),
        serde_json::Value::String(format!(
            "{}/{}",
            config.provisioner_id, config.worker_type
        )),
    );
    fields.insert(
        "workerId".to_string(),
        serde_json::Value::String(config.worker_id.clone()),
    );
    fields.insert(
        "timestamp".to_string(),
        serde_json::Value::Number(serde_json::Number::from(timestamp.timestamp())),
    );
    fields.insert(
        "region".to_string(),
        serde_json::Value::String(config.region.clone()),
    );
    fields.insert(
        "instanceType".to_string(),
        serde_json::Value::String(config.instance_type.clone()),
    );

    if let Some(task) = task {
        fields.insert(
            "taskId".to_string(),
            serde_json::Value::String(task.task_id.to_string()),
        );
        fields.insert(
            "runId".to_string(),
            serde_json::Value::Number(serde_json::Number::from(task.run_id)),
        );
    }

    let json_value = serde_json::Value::Object(fields);
    match serde_json::to_string(&json_value) {
        Ok(j) => {
            // Use log::info! to match the Go log.Printf("WORKER_METRICS %s", j) behaviour.
            // The Go log package prefixes with a timestamp, and tracing/log will
            // do the same.
            tracing::info!("WORKER_METRICS {}", j);
        }
        Err(e) => {
            tracing::error!("Error encoding working metrics: {e}");
        }
    }
}
