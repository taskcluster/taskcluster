//! Mock Taskcluster service implementations for testing.
//!
//! Provides an in-memory mock Queue that implements the Queue trait,
//! modeled after the Go generic-worker's mocktc package.

use anyhow::{bail, Result};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::model::*;
use crate::tc::Queue;

/// In-memory state for a task (definition + status).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDefinitionAndStatus {
    pub task: TaskDefinitionResponse,
    pub status: TaskStatusStructure,
}

/// Request to create a task, mirroring the Queue API's createTask input.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDefinitionRequest {
    pub provisioner_id: String,
    pub worker_type: String,
    pub scheduler_id: String,
    pub task_group_id: String,
    pub dependencies: Vec<String>,
    pub scopes: Vec<String>,
    pub payload: serde_json::Value,
    pub metadata: TaskMetadata,
    pub expires: String,
    pub deadline: String,
    #[serde(default)]
    pub tags: HashMap<String, String>,
    #[serde(default)]
    pub extra: serde_json::Value,
    #[serde(default)]
    pub priority: String,
    #[serde(default)]
    pub retries: u32,
}

/// Thread-safe inner state of the mock queue.
#[derive(Debug, Default)]
struct MockQueueInner {
    /// tasks["<taskId>"]
    tasks: HashMap<String, TaskDefinitionAndStatus>,
    /// FIFO ordering of task IDs for claim_work
    ordered_tasks: Vec<String>,
    /// artifacts["<taskId>:<runId>"]["<name>"]
    artifacts: HashMap<String, HashMap<String, serde_json::Value>>,
}

/// Mock Queue implementation with in-memory task and artifact storage.
#[derive(Debug, Clone)]
pub struct MockQueue {
    inner: Arc<RwLock<MockQueueInner>>,
}

impl MockQueue {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(RwLock::new(MockQueueInner::default())),
        }
    }

    /// Create a task in the mock queue (equivalent to Queue.createTask API).
    pub fn create_task_directly(
        &self,
        task_id: &str,
        request: &TaskDefinitionRequest,
    ) -> Result<()> {
        let mut inner = self.inner.write().map_err(|e| anyhow::anyhow!("{e}"))?;

        inner.tasks.insert(
            task_id.to_string(),
            TaskDefinitionAndStatus {
                status: TaskStatusStructure {
                    task_id: task_id.to_string(),
                    provisioner_id: request.provisioner_id.clone(),
                    worker_type: request.worker_type.clone(),
                    scheduler_id: request.scheduler_id.clone(),
                    task_group_id: request.task_group_id.clone(),
                    state: "pending".to_string(),
                    runs: vec![],
                },
                task: TaskDefinitionResponse {
                    task_group_id: request.task_group_id.clone(),
                    provisioner_id: request.provisioner_id.clone(),
                    worker_type: request.worker_type.clone(),
                    payload: request.payload.clone(),
                    metadata: request.metadata.clone(),
                    expires: request
                        .expires
                        .parse()
                        .unwrap_or_else(|_| Utc::now() + Duration::days(14)),
                    deadline: request
                        .deadline
                        .parse()
                        .unwrap_or_else(|_| Utc::now() + Duration::minutes(15)),
                    scopes: request.scopes.clone(),
                    dependencies: request.dependencies.clone(),
                    tags: request.tags.clone(),
                    extra: request.extra.clone(),
                },
            },
        );
        inner.ordered_tasks.push(task_id.to_string());
        Ok(())
    }

    /// Get the resolved state of a task's first run (for test assertions).
    pub fn get_run_state(&self, task_id: &str) -> Option<(String, String)> {
        let inner = self.inner.read().ok()?;
        let task = inner.tasks.get(task_id)?;
        let run = task.status.runs.first()?;
        Some((run.state.clone(), run.reason_resolved.clone()))
    }

    fn ensure_running(&self, task_id: &str) -> Result<()> {
        let inner = self.inner.read().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task = inner
            .tasks
            .get(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task {task_id} not found"))?;
        if task.status.runs.is_empty() || task.status.runs[0].state != "running" {
            bail!("Task {task_id} not running");
        }
        Ok(())
    }
}

impl Queue for MockQueue {
    async fn claim_work(
        &self,
        provisioner_id: &str,
        worker_type: &str,
        request: &ClaimWorkRequest,
    ) -> Result<ClaimWorkResponse> {
        let mut inner = self.inner.write().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task_queue_id = format!("{provisioner_id}/{worker_type}");
        let max_tasks = request.tasks as usize;
        let mut tasks = Vec::new();

        // Iterate in FIFO order to find pending tasks matching the queue ID.
        let ordered = inner.ordered_tasks.clone();
        for task_id in &ordered {
            if tasks.len() >= max_tasks {
                break;
            }
            let Some(task_entry) = inner.tasks.get_mut(task_id) else {
                continue;
            };
            let entry_queue_id = format!(
                "{}/{}",
                task_entry.status.provisioner_id, task_entry.status.worker_type
            );
            if entry_queue_id == task_queue_id && task_entry.status.state == "pending" {
                task_entry.status.state = "running".to_string();
                let taken_until = Utc::now() + Duration::minutes(20);
                task_entry.status.runs = vec![RunInfo {
                    run_id: 0,
                    state: "running".to_string(),
                    reason_created: "scheduled".to_string(),
                    reason_resolved: String::new(),
                    started: Some(Utc::now()),
                    resolved: None,
                    taken_until: Some(taken_until),
                    worker_group: request.worker_group.clone(),
                    worker_id: request.worker_id.clone(),
                }];
                tasks.push(TaskClaimResponse {
                    status: task_entry.status.clone(),
                    run_id: 0,
                    task: task_entry.task.clone(),
                    credentials: TaskCredentials {
                        client_id: "test-task-client-id".to_string(),
                        access_token: "test-task-access-token".to_string(),
                        certificate: String::new(),
                    },
                    taken_until,
                });
            }
        }

        Ok(ClaimWorkResponse { tasks })
    }

    async fn reclaim_task(&self, task_id: &str, run_id: u32) -> Result<TaskReclaimResponse> {
        self.ensure_running(task_id)?;
        let inner = self.inner.read().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task = inner
            .tasks
            .get(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task {task_id} not found"))?;
        let taken_until = Utc::now() + Duration::minutes(20);
        Ok(TaskReclaimResponse {
            status: task.status.clone(),
            run_id,
            credentials: TaskCredentials {
                client_id: "test-task-client-id".to_string(),
                access_token: "test-task-access-token".to_string(),
                certificate: String::new(),
            },
            taken_until,
        })
    }

    async fn report_completed(&self, task_id: &str, _run_id: u32) -> Result<()> {
        self.ensure_running(task_id)?;
        let mut inner = self.inner.write().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task = inner
            .tasks
            .get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task {task_id} not found"))?;
        if let Some(run) = task.status.runs.first_mut() {
            run.state = "completed".to_string();
            run.reason_resolved = "completed".to_string();
            run.resolved = Some(Utc::now());
        }
        Ok(())
    }

    async fn report_failed(&self, task_id: &str, _run_id: u32) -> Result<()> {
        self.ensure_running(task_id)?;
        let mut inner = self.inner.write().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task = inner
            .tasks
            .get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task {task_id} not found"))?;
        if let Some(run) = task.status.runs.first_mut() {
            run.state = "failed".to_string();
            run.reason_resolved = "failed".to_string();
            run.resolved = Some(Utc::now());
        }
        Ok(())
    }

    async fn report_exception(&self, task_id: &str, _run_id: u32, reason: &str) -> Result<()> {
        self.ensure_running(task_id)?;
        let mut inner = self.inner.write().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task = inner
            .tasks
            .get_mut(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task {task_id} not found"))?;
        if let Some(run) = task.status.runs.first_mut() {
            run.state = "exception".to_string();
            run.reason_resolved = reason.to_string();
            run.resolved = Some(Utc::now());
        }
        Ok(())
    }

    async fn create_artifact(
        &self,
        task_id: &str,
        run_id: u32,
        name: &str,
        request: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        let mut inner = self.inner.write().map_err(|e| anyhow::anyhow!("{e}"))?;
        let key = format!("{task_id}:{run_id}");
        let artifact_map = inner.artifacts.entry(key).or_default();
        artifact_map.insert(name.to_string(), request.clone());
        Ok(serde_json::json!({}))
    }

    async fn finish_artifact(
        &self,
        _task_id: &str,
        _run_id: u32,
        _name: &str,
        _request: &serde_json::Value,
    ) -> Result<()> {
        // No-op for mock, matching Go implementation.
        Ok(())
    }

    async fn status(&self, task_id: &str) -> Result<TaskStatusStructure> {
        let inner = self.inner.read().map_err(|e| anyhow::anyhow!("{e}"))?;
        let task = inner
            .tasks
            .get(task_id)
            .ok_or_else(|| anyhow::anyhow!("Task {task_id} not found"))?;
        Ok(task.status.clone())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_create_and_claim() {
        let queue = MockQueue::new();
        let task_id = "test-task-1";

        queue
            .create_task_directly(
                task_id,
                &TaskDefinitionRequest {
                    provisioner_id: "test-prov".to_string(),
                    worker_type: "test-wt".to_string(),
                    scheduler_id: "test-scheduler".to_string(),
                    task_group_id: "test-group".to_string(),
                    dependencies: vec![],
                    scopes: vec![],
                    payload: serde_json::json!({}),
                    metadata: TaskMetadata {
                        name: "test".to_string(),
                        description: "test".to_string(),
                        owner: "test@test.com".to_string(),
                        source: "https://example.com".to_string(),
                    },
                    expires: Utc::now()
                        .checked_add_signed(Duration::days(14))
                        .unwrap()
                        .to_rfc3339(),
                    deadline: Utc::now()
                        .checked_add_signed(Duration::minutes(15))
                        .unwrap()
                        .to_rfc3339(),
                    tags: HashMap::new(),
                    extra: serde_json::json!({}),
                    priority: "lowest".to_string(),
                    retries: 1,
                },
            )
            .unwrap();

        let request = ClaimWorkRequest {
            tasks: 1,
            worker_group: "test-group".to_string(),
            worker_id: "test-worker".to_string(),
        };
        let response = queue
            .claim_work("test-prov", "test-wt", &request)
            .await
            .unwrap();
        assert_eq!(response.tasks.len(), 1);
        assert_eq!(response.tasks[0].status.task_id, task_id);
        assert_eq!(response.tasks[0].status.runs[0].state, "running");
    }

    #[tokio::test]
    async fn test_report_completed() {
        let queue = MockQueue::new();
        let task_id = "test-task-2";

        queue
            .create_task_directly(
                task_id,
                &TaskDefinitionRequest {
                    provisioner_id: "test-prov".to_string(),
                    worker_type: "test-wt".to_string(),
                    scheduler_id: "test-scheduler".to_string(),
                    task_group_id: "test-group".to_string(),
                    dependencies: vec![],
                    scopes: vec![],
                    payload: serde_json::json!({}),
                    metadata: TaskMetadata {
                        name: "test".to_string(),
                        description: "test".to_string(),
                        owner: "test@test.com".to_string(),
                        source: "https://example.com".to_string(),
                    },
                    expires: Utc::now()
                        .checked_add_signed(Duration::days(14))
                        .unwrap()
                        .to_rfc3339(),
                    deadline: Utc::now()
                        .checked_add_signed(Duration::minutes(15))
                        .unwrap()
                        .to_rfc3339(),
                    tags: HashMap::new(),
                    extra: serde_json::json!({}),
                    priority: "lowest".to_string(),
                    retries: 1,
                },
            )
            .unwrap();

        // Claim first
        let request = ClaimWorkRequest {
            tasks: 1,
            worker_group: "test-group".to_string(),
            worker_id: "test-worker".to_string(),
        };
        queue
            .claim_work("test-prov", "test-wt", &request)
            .await
            .unwrap();

        // Report completed
        queue.report_completed(task_id, 0).await.unwrap();

        let (state, reason) = queue.get_run_state(task_id).unwrap();
        assert_eq!(state, "completed");
        assert_eq!(reason, "completed");
    }

    #[tokio::test]
    async fn test_report_failed() {
        let queue = MockQueue::new();
        let task_id = "test-task-3";

        queue
            .create_task_directly(
                task_id,
                &TaskDefinitionRequest {
                    provisioner_id: "test-prov".to_string(),
                    worker_type: "test-wt".to_string(),
                    scheduler_id: "test-scheduler".to_string(),
                    task_group_id: "test-group".to_string(),
                    dependencies: vec![],
                    scopes: vec![],
                    payload: serde_json::json!({}),
                    metadata: TaskMetadata {
                        name: "test".to_string(),
                        description: "test".to_string(),
                        owner: "test@test.com".to_string(),
                        source: "https://example.com".to_string(),
                    },
                    expires: Utc::now()
                        .checked_add_signed(Duration::days(14))
                        .unwrap()
                        .to_rfc3339(),
                    deadline: Utc::now()
                        .checked_add_signed(Duration::minutes(15))
                        .unwrap()
                        .to_rfc3339(),
                    tags: HashMap::new(),
                    extra: serde_json::json!({}),
                    priority: "lowest".to_string(),
                    retries: 1,
                },
            )
            .unwrap();

        let request = ClaimWorkRequest {
            tasks: 1,
            worker_group: "test-group".to_string(),
            worker_id: "test-worker".to_string(),
        };
        queue
            .claim_work("test-prov", "test-wt", &request)
            .await
            .unwrap();

        queue.report_failed(task_id, 0).await.unwrap();

        let (state, reason) = queue.get_run_state(task_id).unwrap();
        assert_eq!(state, "failed");
        assert_eq!(reason, "failed");
    }

    #[tokio::test]
    async fn test_report_exception() {
        let queue = MockQueue::new();
        let task_id = "test-task-4";

        queue
            .create_task_directly(
                task_id,
                &TaskDefinitionRequest {
                    provisioner_id: "test-prov".to_string(),
                    worker_type: "test-wt".to_string(),
                    scheduler_id: "test-scheduler".to_string(),
                    task_group_id: "test-group".to_string(),
                    dependencies: vec![],
                    scopes: vec![],
                    payload: serde_json::json!({}),
                    metadata: TaskMetadata {
                        name: "test".to_string(),
                        description: "test".to_string(),
                        owner: "test@test.com".to_string(),
                        source: "https://example.com".to_string(),
                    },
                    expires: Utc::now()
                        .checked_add_signed(Duration::days(14))
                        .unwrap()
                        .to_rfc3339(),
                    deadline: Utc::now()
                        .checked_add_signed(Duration::minutes(15))
                        .unwrap()
                        .to_rfc3339(),
                    tags: HashMap::new(),
                    extra: serde_json::json!({}),
                    priority: "lowest".to_string(),
                    retries: 1,
                },
            )
            .unwrap();

        let request = ClaimWorkRequest {
            tasks: 1,
            worker_group: "test-group".to_string(),
            worker_id: "test-worker".to_string(),
        };
        queue
            .claim_work("test-prov", "test-wt", &request)
            .await
            .unwrap();

        queue
            .report_exception(task_id, 0, "malformed-payload")
            .await
            .unwrap();

        let (state, reason) = queue.get_run_state(task_id).unwrap();
        assert_eq!(state, "exception");
        assert_eq!(reason, "malformed-payload");
    }

    #[tokio::test]
    async fn test_no_work_available() {
        let queue = MockQueue::new();
        let request = ClaimWorkRequest {
            tasks: 1,
            worker_group: "test-group".to_string(),
            worker_id: "test-worker".to_string(),
        };
        let response = queue
            .claim_work("test-prov", "test-wt", &request)
            .await
            .unwrap();
        assert!(response.tasks.is_empty());
    }

    #[tokio::test]
    async fn test_claim_wrong_queue() {
        let queue = MockQueue::new();
        queue
            .create_task_directly(
                "task-1",
                &TaskDefinitionRequest {
                    provisioner_id: "prov-a".to_string(),
                    worker_type: "wt-a".to_string(),
                    scheduler_id: "test-scheduler".to_string(),
                    task_group_id: "test-group".to_string(),
                    dependencies: vec![],
                    scopes: vec![],
                    payload: serde_json::json!({}),
                    metadata: TaskMetadata {
                        name: "test".to_string(),
                        description: "test".to_string(),
                        owner: "test@test.com".to_string(),
                        source: "https://example.com".to_string(),
                    },
                    expires: Utc::now()
                        .checked_add_signed(Duration::days(14))
                        .unwrap()
                        .to_rfc3339(),
                    deadline: Utc::now()
                        .checked_add_signed(Duration::minutes(15))
                        .unwrap()
                        .to_rfc3339(),
                    tags: HashMap::new(),
                    extra: serde_json::json!({}),
                    priority: "lowest".to_string(),
                    retries: 1,
                },
            )
            .unwrap();

        let request = ClaimWorkRequest {
            tasks: 1,
            worker_group: "test-group".to_string(),
            worker_id: "test-worker".to_string(),
        };
        // Claim from a different provisioner/workerType - should get nothing
        let response = queue
            .claim_work("prov-b", "wt-b", &request)
            .await
            .unwrap();
        assert!(response.tasks.is_empty());
    }
}
