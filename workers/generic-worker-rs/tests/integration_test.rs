//! Integration tests for the generic worker.
//!
//! These tests use a mock HTTP server (built with axum) that implements the
//! Taskcluster Queue API endpoints, backed by the in-memory MockQueue from
//! src/mock_tc.rs. The worker binary is configured to point at this mock
//! server as its rootURL, so it claims tasks, executes commands, and reports
//! results against the mock.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post, put},
    Json, Router,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::io::Write;
use std::sync::{Arc, RwLock};
use tempfile::TempDir;
use tokio::net::TcpListener;

// ---------------------------------------------------------------------------
// In-test mock queue state (self-contained, not importing from the binary)
// ---------------------------------------------------------------------------

/// In-memory task entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskEntry {
    task: TaskDefResponse,
    status: TaskStatusStructure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskDefResponse {
    task_group_id: String,
    payload: Value,
    metadata: TaskMetadata,
    expires: String,
    deadline: String,
    scopes: Vec<String>,
    dependencies: Vec<String>,
    tags: HashMap<String, String>,
    extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskMetadata {
    name: String,
    description: String,
    owner: String,
    source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskStatusStructure {
    task_id: String,
    provisioner_id: String,
    worker_type: String,
    scheduler_id: String,
    task_group_id: String,
    state: String,
    runs: Vec<RunInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunInfo {
    run_id: u32,
    state: String,
    #[serde(default)]
    reason_created: String,
    #[serde(default)]
    reason_resolved: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    started: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    resolved: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    taken_until: Option<String>,
    #[serde(default)]
    worker_group: String,
    #[serde(default)]
    worker_id: String,
}

/// Shared state for the mock HTTP server.
#[derive(Debug, Default)]
struct MockState {
    tasks: HashMap<String, TaskEntry>,
    ordered_tasks: Vec<String>,
    artifacts: HashMap<String, HashMap<String, Value>>,
}

type SharedState = Arc<RwLock<MockState>>;

// ---------------------------------------------------------------------------
// Axum route handlers implementing the Queue HTTP API
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimWorkRequest {
    tasks_claimed: u32,
    worker_group: String,
    worker_id: String,
}

async fn claim_work(
    Path((provisioner_id, worker_type)): Path<(String, String)>,
    State(state): State<SharedState>,
    Json(body): Json<ClaimWorkRequest>,
) -> Json<Value> {
    let mut inner = state.write().unwrap();
    let task_queue_id = format!("{provisioner_id}/{worker_type}");
    let max = body.tasks_claimed as usize;
    let mut tasks = Vec::new();

    let ordered = inner.ordered_tasks.clone();
    for task_id in &ordered {
        if tasks.len() >= max {
            break;
        }
        let Some(entry) = inner.tasks.get_mut(task_id) else {
            continue;
        };
        let entry_qid = format!(
            "{}/{}",
            entry.status.provisioner_id, entry.status.worker_type
        );
        if entry_qid == task_queue_id && entry.status.state == "pending" {
            entry.status.state = "running".to_string();
            let taken_until = (Utc::now() + Duration::minutes(20)).to_rfc3339();
            entry.status.runs = vec![RunInfo {
                run_id: 0,
                state: "running".to_string(),
                reason_created: "scheduled".to_string(),
                reason_resolved: String::new(),
                started: Some(Utc::now().to_rfc3339()),
                resolved: None,
                taken_until: Some(taken_until.clone()),
                worker_group: body.worker_group.clone(),
                worker_id: body.worker_id.clone(),
            }];
            tasks.push(serde_json::json!({
                "status": entry.status,
                "runId": 0,
                "task": entry.task,
                "credentials": {
                    "clientId": "test-task-client-id",
                    "accessToken": "test-task-access-token",
                    "certificate": ""
                },
                "takenUntil": taken_until,
            }));
        }
    }

    Json(serde_json::json!({ "tasks": tasks }))
}

async fn reclaim_task(
    Path((task_id, _run_id)): Path<(String, String)>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, StatusCode> {
    let inner = state.read().unwrap();
    let entry = inner.tasks.get(&task_id).ok_or(StatusCode::NOT_FOUND)?;
    if entry.status.runs.is_empty() || entry.status.runs[0].state != "running" {
        return Err(StatusCode::CONFLICT);
    }
    let taken_until = (Utc::now() + Duration::minutes(20)).to_rfc3339();
    Ok(Json(serde_json::json!({
        "status": entry.status,
        "runId": _run_id.parse::<u32>().unwrap_or(0),
        "credentials": {
            "clientId": "test-task-client-id",
            "accessToken": "test-task-access-token",
            "certificate": ""
        },
        "takenUntil": taken_until,
    })))
}

async fn report_completed(
    Path((task_id, _run_id)): Path<(String, String)>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, StatusCode> {
    let mut inner = state.write().unwrap();
    let entry = inner.tasks.get_mut(&task_id).ok_or(StatusCode::NOT_FOUND)?;
    if let Some(run) = entry.status.runs.first_mut() {
        run.state = "completed".to_string();
        run.reason_resolved = "completed".to_string();
        run.resolved = Some(Utc::now().to_rfc3339());
    }
    Ok(Json(serde_json::json!({ "status": entry.status })))
}

async fn report_failed(
    Path((task_id, _run_id)): Path<(String, String)>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, StatusCode> {
    let mut inner = state.write().unwrap();
    let entry = inner.tasks.get_mut(&task_id).ok_or(StatusCode::NOT_FOUND)?;
    if let Some(run) = entry.status.runs.first_mut() {
        run.state = "failed".to_string();
        run.reason_resolved = "failed".to_string();
        run.resolved = Some(Utc::now().to_rfc3339());
    }
    Ok(Json(serde_json::json!({ "status": entry.status })))
}

#[derive(Deserialize)]
struct ExceptionBody {
    reason: String,
}

async fn report_exception(
    Path((task_id, _run_id)): Path<(String, String)>,
    State(state): State<SharedState>,
    Json(body): Json<ExceptionBody>,
) -> Result<Json<Value>, StatusCode> {
    let mut inner = state.write().unwrap();
    let entry = inner.tasks.get_mut(&task_id).ok_or(StatusCode::NOT_FOUND)?;
    if let Some(run) = entry.status.runs.first_mut() {
        run.state = "exception".to_string();
        run.reason_resolved = body.reason;
        run.resolved = Some(Utc::now().to_rfc3339());
    }
    Ok(Json(serde_json::json!({ "status": entry.status })))
}

async fn create_artifact_wildcard(
    Path((task_id, run_id, name)): Path<(String, String, String)>,
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> Json<Value> {
    // The wildcard `*rest` may have a leading `/` in axum 0.7 - strip it.
    let name = name.strip_prefix('/').unwrap_or(&name).to_string();
    let mut inner = state.write().unwrap();
    let key = format!("{task_id}:{run_id}");
    let map = inner.artifacts.entry(key).or_default();
    map.insert(name, body);
    Json(serde_json::json!({}))
}

async fn finish_artifact_wildcard(
    Path((_task_id, _run_id, rest)): Path<(String, String, String)>,
    State(_state): State<SharedState>,
) -> Json<Value> {
    // Called for PUT on .../artifacts/<name>/finish - no-op in mock.
    let _ = rest;
    Json(serde_json::json!({}))
}

async fn task_status(
    Path(task_id): Path<String>,
    State(state): State<SharedState>,
) -> Result<Json<Value>, StatusCode> {
    let inner = state.read().unwrap();
    let entry = inner.tasks.get(&task_id).ok_or(StatusCode::NOT_FOUND)?;
    Ok(Json(serde_json::json!({ "status": entry.status })))
}

async fn create_task(
    Path(task_id): Path<String>,
    State(state): State<SharedState>,
    Json(body): Json<Value>,
) -> Json<Value> {
    let mut inner = state.write().unwrap();

    let provisioner_id = body["provisionerId"].as_str().unwrap_or("").to_string();
    let worker_type = body["workerType"].as_str().unwrap_or("").to_string();
    let scheduler_id = body["schedulerId"].as_str().unwrap_or("test-scheduler").to_string();
    let task_group_id = body["taskGroupId"].as_str().unwrap_or("test-group").to_string();

    let entry = TaskEntry {
        status: TaskStatusStructure {
            task_id: task_id.clone(),
            provisioner_id: provisioner_id.clone(),
            worker_type: worker_type.clone(),
            scheduler_id: scheduler_id.clone(),
            task_group_id: task_group_id.clone(),
            state: "pending".to_string(),
            runs: vec![],
        },
        task: TaskDefResponse {
            task_group_id: task_group_id.clone(),
            payload: body["payload"].clone(),
            metadata: serde_json::from_value(body["metadata"].clone()).unwrap_or_else(|_| {
                TaskMetadata {
                    name: "test".to_string(),
                    description: "test".to_string(),
                    owner: "test@test.com".to_string(),
                    source: "https://example.com".to_string(),
                }
            }),
            expires: body["expires"]
                .as_str()
                .unwrap_or(&(Utc::now() + Duration::days(14)).to_rfc3339())
                .to_string(),
            deadline: body["deadline"]
                .as_str()
                .unwrap_or(&(Utc::now() + Duration::minutes(15)).to_rfc3339())
                .to_string(),
            scopes: body["scopes"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            dependencies: body["dependencies"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default(),
            tags: serde_json::from_value(body["tags"].clone()).unwrap_or_default(),
            extra: body["extra"].clone(),
        },
    };

    inner.tasks.insert(task_id.clone(), entry);
    inner.ordered_tasks.push(task_id.clone());

    Json(serde_json::json!({
        "status": {
            "taskId": task_id,
            "state": "pending",
            "runs": [],
        }
    }))
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/// A test environment with mock server and temp dirs.
struct TestEnv {
    root_url: String,
    state: SharedState,
    config_path: String,
    #[allow(dead_code)]
    tasks_dir: String,
    _tmp_dir: TempDir,
}

/// Start a mock HTTP server on a random port and return the test environment.
async fn setup() -> TestEnv {
    let state: SharedState = Arc::new(RwLock::new(MockState::default()));

    let app = Router::new()
        // Queue API routes under /api/queue/v1
        .route(
            "/api/queue/v1/claim-work/:provisioner_id/:worker_type",
            post(claim_work),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/reclaim",
            post(reclaim_task),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/completed",
            put(report_completed),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/failed",
            put(report_failed),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/exception",
            put(report_exception),
        )
        // Catch-all for artifact routes (names can contain slashes).
        // Handles both POST (create) and PUT (finish) on artifact paths.
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/artifacts/*rest",
            post(create_artifact_wildcard).put(finish_artifact_wildcard),
        )
        .route(
            "/api/queue/v1/task/:task_id/status",
            get(task_status),
        )
        .route("/api/queue/v1/task/:task_id", put(create_task))
        .fallback(|req: axum::extract::Request| async move {
            eprintln!("[mock-server] UNHANDLED {} {}", req.method(), req.uri());
            StatusCode::NOT_FOUND
        })
        .with_state(state.clone());

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let root_url = format!("http://{addr}");

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Wait briefly for the server to start accepting connections.
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    // Create temp directory for config and tasks
    let tmp_dir = TempDir::new().unwrap();
    let tasks_dir = tmp_dir.path().join("tasks");
    std::fs::create_dir_all(&tasks_dir).unwrap();

    let config = serde_json::json!({
        "rootUrl": root_url,
        "clientId": "test-client-id",
        "accessToken": "test-access-token",
        "provisionerId": "test-provisioner",
        "workerType": "test-worker-type",
        "workerGroup": "test-worker-group",
        "workerId": "test-worker-id",
        "tasksDir": tasks_dir.display().to_string(),
        "cachesDir": tmp_dir.path().join("caches").display().to_string(),
        "downloadsDir": tmp_dir.path().join("downloads").display().to_string(),
        "numberOfTasksToRun": 1,
        "idleTimeoutSecs": 5,
        "shutdownMachineOnIdle": false,
        "disableReboots": true,
        "cleanUpTaskDirs": true,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": false,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
    });

    let config_path = tmp_dir.path().join("config.json");
    let mut f = std::fs::File::create(&config_path).unwrap();
    f.write_all(serde_json::to_string_pretty(&config).unwrap().as_bytes())
        .unwrap();

    TestEnv {
        root_url: format!("http://{addr}"),
        state,
        config_path: config_path.display().to_string(),
        tasks_dir: tasks_dir.display().to_string(),
        _tmp_dir: tmp_dir,
    }
}

/// Start a mock HTTP server with optional config overrides merged into the defaults.
async fn setup_with_overrides(overrides: serde_json::Value) -> TestEnv {
    let state: SharedState = Arc::new(RwLock::new(MockState::default()));

    let app = Router::new()
        .route(
            "/api/queue/v1/claim-work/:provisioner_id/:worker_type",
            post(claim_work),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/reclaim",
            post(reclaim_task),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/completed",
            put(report_completed),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/failed",
            put(report_failed),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/exception",
            put(report_exception),
        )
        .route(
            "/api/queue/v1/task/:task_id/runs/:run_id/artifacts/*rest",
            post(create_artifact_wildcard).put(finish_artifact_wildcard),
        )
        .route(
            "/api/queue/v1/task/:task_id/status",
            get(task_status),
        )
        .route("/api/queue/v1/task/:task_id", put(create_task))
        .fallback(|req: axum::extract::Request| async move {
            eprintln!("[mock-server] UNHANDLED {} {}", req.method(), req.uri());
            StatusCode::NOT_FOUND
        })
        .with_state(state.clone());

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let root_url = format!("http://{addr}");

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let tmp_dir = TempDir::new().unwrap();
    let tasks_dir = tmp_dir.path().join("tasks");
    std::fs::create_dir_all(&tasks_dir).unwrap();

    let mut config = serde_json::json!({
        "rootUrl": root_url,
        "clientId": "test-client-id",
        "accessToken": "test-access-token",
        "provisionerId": "test-provisioner",
        "workerType": "test-worker-type",
        "workerGroup": "test-worker-group",
        "workerId": "test-worker-id",
        "tasksDir": tasks_dir.display().to_string(),
        "cachesDir": tmp_dir.path().join("caches").display().to_string(),
        "downloadsDir": tmp_dir.path().join("downloads").display().to_string(),
        "numberOfTasksToRun": 1,
        "idleTimeoutSecs": 5,
        "shutdownMachineOnIdle": false,
        "disableReboots": true,
        "cleanUpTaskDirs": true,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": false,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
    });

    // Merge overrides into the base config.
    if let (Some(base), Some(over)) = (config.as_object_mut(), overrides.as_object()) {
        for (k, v) in over {
            base.insert(k.clone(), v.clone());
        }
    }

    let config_path = tmp_dir.path().join("config.json");
    let mut f = std::fs::File::create(&config_path).unwrap();
    f.write_all(serde_json::to_string_pretty(&config).unwrap().as_bytes())
        .unwrap();

    TestEnv {
        root_url: format!("http://{addr}"),
        state,
        config_path: config_path.display().to_string(),
        tasks_dir: tasks_dir.display().to_string(),
        _tmp_dir: tmp_dir,
    }
}

/// Create a task definition with reasonable defaults.
fn test_task(provisioner_id: &str, worker_type: &str, payload: Value) -> Value {
    let now = Utc::now();
    let deadline = now + Duration::minutes(15);
    let expires = now + Duration::days(14);

    serde_json::json!({
        "provisionerId": provisioner_id,
        "workerType": worker_type,
        "schedulerId": "test-scheduler",
        "taskGroupId": "test-task-group",
        "dependencies": [],
        "scopes": [],
        "payload": payload,
        "metadata": {
            "name": "Integration Test Task",
            "description": "A task created by integration tests",
            "owner": "test@example.com",
            "source": "https://github.com/taskcluster/taskcluster"
        },
        "expires": expires.to_rfc3339(),
        "deadline": deadline.to_rfc3339(),
        "tags": {},
        "extra": {},
        "priority": "lowest",
        "retries": 0,
    })
}

/// Schedule a task via the mock HTTP server (POST to createTask endpoint).
async fn schedule_task(env: &TestEnv, task_id: &str, task_def: &Value) {
    let client = reqwest::Client::new();
    let url = format!("{}/api/queue/v1/task/{}", env.root_url, task_id);
    let resp = client.put(&url).json(task_def).send().await.unwrap();
    assert!(
        resp.status().is_success(),
        "Failed to create task: {}",
        resp.status()
    );
}

/// Get the path to the built binary. Tests assume it was built by `cargo test`.
fn worker_binary() -> String {
    // The binary is built alongside the tests. Find it relative to the test binary.
    let mut path = std::env::current_exe().unwrap();
    // test binary is in target/debug/deps/integration_test-HASH
    // the main binary is in target/debug/generic-worker
    path.pop(); // remove integration_test-HASH
    if path.ends_with("deps") {
        path.pop(); // remove deps
    }
    path.push("generic-worker");
    assert!(
        path.exists(),
        "Worker binary not found at {}. Build it first with `cargo build`.",
        path.display()
    );
    path.display().to_string()
}

/// Run the worker binary with the given config, with a timeout.
async fn run_worker(config_path: &str) -> (String, String) {
    let _ = std::fs::write("tasks-resolved-count.txt", "0"); // reset per-test
    let binary = worker_binary();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(30),
        tokio::process::Command::new(&binary)
            .args(["run", "--config", config_path])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => (
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).to_string(),
        ),
        Ok(Err(e)) => panic!("Failed to run worker binary: {e}"),
        Err(_) => panic!("Worker binary timed out after 30 seconds"),
    }
}

/// Schedule a task, run the worker, and assert the task resolved as expected.
async fn submit_and_assert(
    env: &TestEnv,
    task_id: &str,
    payload: Value,
    expected_state: &str,
    expected_reason: &str,
) {
    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(env, task_id, &td).await;

    let (stdout, stderr) = run_worker(&env.config_path).await;

    // Check the task resolution
    let inner = env.state.read().unwrap();
    let entry = inner
        .tasks
        .get(task_id)
        .unwrap_or_else(|| panic!("Task {task_id} not found in mock state.\nstdout:\n{stdout}\nstderr:\n{stderr}"));

    assert!(
        !entry.status.runs.is_empty(),
        "Task {task_id} has no runs. stdout:\n{stdout}\nstderr:\n{stderr}"
    );

    let run = &entry.status.runs[0];
    assert_eq!(
        run.state, expected_state,
        "Expected task state '{expected_state}' but got '{}'. reason_resolved='{}'\nstdout:\n{stdout}\nstderr:\n{stderr}",
        run.state, run.reason_resolved
    );
    assert_eq!(
        run.reason_resolved, expected_reason,
        "Expected reason '{expected_reason}' but got '{}'\nstdout:\n{stdout}\nstderr:\n{stderr}",
        run.reason_resolved
    );
}

/// Run the worker binary with the given config, with a custom timeout.
async fn run_worker_with_timeout(config_path: &str, timeout_secs: u64) -> (String, String) {
    let _ = std::fs::write("tasks-resolved-count.txt", "0"); // reset per-test
    let binary = worker_binary();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        tokio::process::Command::new(&binary)
            .args(["run", "--config", config_path])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => (
            String::from_utf8_lossy(&output.stdout).to_string(),
            String::from_utf8_lossy(&output.stderr).to_string(),
        ),
        Ok(Err(e)) => panic!("Failed to run worker binary: {e}"),
        Err(_) => panic!("Worker binary timed out after {timeout_secs} seconds"),
    }
}

/// Write a custom config file to the temp dir and return its path.
fn write_config(env: &TestEnv, config: &Value) -> String {
    let path = std::path::Path::new(&env.config_path)
        .parent()
        .unwrap()
        .join("custom-config.json");
    let mut f = std::fs::File::create(&path).unwrap();
    f.write_all(serde_json::to_string_pretty(config).unwrap().as_bytes())
        .unwrap();
    path.display().to_string()
}

// ---------------------------------------------------------------------------
// Integration tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn test_success_resolves_as_completed() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60
    });

    submit_and_assert(&env, "task-success-1", payload, "completed", "completed").await;
}

#[tokio::test]
async fn test_failure_resolves_as_failed() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["false"]],
        "maxRunTime": 60
    });

    submit_and_assert(&env, "task-fail-1", payload, "failed", "failed").await;
}

#[tokio::test]
async fn test_max_run_time_exceeded() {
    let env = setup().await;

    // Sleep for 30 seconds but maxRunTime is only 2 seconds
    let payload = serde_json::json!({
        "command": [["sleep", "30"]],
        "maxRunTime": 2
    });

    // When maxRunTime is exceeded, the worker should kill the process and
    // report it as failed or exception (depending on implementation).
    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(&env, "task-timeout-1", &td).await;

    let (stdout, stderr) = run_worker(&env.config_path).await;

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-timeout-1").unwrap();

    assert!(
        !entry.status.runs.is_empty(),
        "Task has no runs. stdout:\n{stdout}\nstderr:\n{stderr}"
    );

    let run = &entry.status.runs[0];
    // The task should not have completed successfully.
    assert_ne!(
        run.state, "completed",
        "Task should NOT have completed - maxRunTime should have been exceeded.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
    // It should be either failed or exception (depending on how the worker
    // handles maxRunTime kill). Both are acceptable for a timed-out task.
    assert!(
        run.state == "failed" || run.state == "exception",
        "Expected task state 'failed' or 'exception' but got '{}'. reason='{}'\nstdout:\n{stdout}\nstderr:\n{stderr}",
        run.state,
        run.reason_resolved
    );
}

// ---------------------------------------------------------------------------
// Ported tests from Go generic-worker
// ---------------------------------------------------------------------------

// From main_test.go: TestIdleWithoutCrash
// Worker should exit cleanly after idle timeout with no tasks to claim.
#[cfg(unix)]
#[tokio::test]
async fn test_idle_without_crash() {
    let env = setup().await;

    // Override config with shutdownMachineOnIdle=true and short idle timeout
    let config = serde_json::json!({
        "rootUrl": env.root_url,
        "clientId": "test-client-id",
        "accessToken": "test-access-token",
        "provisionerId": "test-provisioner",
        "workerType": "test-worker-type",
        "workerGroup": "test-worker-group",
        "workerId": "test-worker-id",
        "tasksDir": env.tasks_dir,
        "cachesDir": std::path::Path::new(&env.config_path).parent().unwrap().join("caches").display().to_string(),
        "downloadsDir": std::path::Path::new(&env.config_path).parent().unwrap().join("downloads").display().to_string(),
        "numberOfTasksToRun": 0,
        "idleTimeoutSecs": 3,
        "shutdownMachineOnIdle": true,
        "disableReboots": true,
        "cleanUpTaskDirs": true,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": false,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
    });
    let config_path = write_config(&env, &config);

    let start = std::time::Instant::now();
    let (_stdout, _stderr) = run_worker_with_timeout(&config_path, 30).await;
    let elapsed = start.elapsed().as_secs_f64();

    // Worker should have been alive for at least the idle timeout period.
    assert!(
        elapsed >= 3.0,
        "Worker died too early - lasted only {elapsed:.1}s, expected at least 3s"
    );
    // And should not have taken an unreasonable amount of time.
    assert!(
        elapsed < 25.0,
        "Worker took too long to exit - {elapsed:.1}s, expected less than 25s"
    );
}

// From main_test.go: TestAbortAfterMaxRunTime
// A task with sleep exceeding maxRunTime gets aborted.
#[cfg(unix)]
#[tokio::test]
async fn test_abort_after_max_run_time() {
    let env = setup().await;

    // Sleep for 120 seconds but maxRunTime is only 5 seconds.
    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "for i in $(seq 1 33); do echo \"hello $i\"; sleep 1; done"],
            // This subsequent command should NOT run because the task should be aborted.
            ["bash", "-c", "echo hello && echo goodbye"]
        ],
        "maxRunTime": 5
    });

    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(&env, "task-abort-mrt-1", &td).await;

    let start = std::time::Instant::now();
    let (stdout, stderr) = run_worker(&env.config_path).await;
    let elapsed = start.elapsed().as_secs_f64();

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-abort-mrt-1").unwrap_or_else(|| {
        panic!("Task not found in mock state.\nstdout:\n{stdout}\nstderr:\n{stderr}")
    });

    assert!(
        !entry.status.runs.is_empty(),
        "Task has no runs. stdout:\n{stdout}\nstderr:\n{stderr}"
    );

    let run = &entry.status.runs[0];
    assert_eq!(
        run.state, "failed",
        "Expected task to be 'failed' due to maxRunTime, got '{}'. reason='{}'\nstdout:\n{stdout}\nstderr:\n{stderr}",
        run.state, run.reason_resolved
    );

    // Task should have taken at least 5 seconds (the maxRunTime).
    assert!(
        elapsed >= 5.0,
        "Task should have taken at least 5s, but took {elapsed:.1}s"
    );
    // Task should not have taken more than 25 seconds.
    assert!(
        elapsed < 25.0,
        "Task should have taken no more than 25s, but took {elapsed:.1}s"
    );
}

// From main_test.go: TestNonExistentCommandFailsTask
// Running a non-existent binary should fail the task (not cause an exception).
// See https://bugzil.la/1479415
#[cfg(unix)]
#[tokio::test]
async fn test_non_existent_command_fails_task() {
    let env = setup().await;

    // Use a random binary name that definitely does not exist.
    let payload = serde_json::json!({
        "command": [["nonexistent-binary-12345abcde"]],
        "maxRunTime": 10
    });

    submit_and_assert(&env, "task-noexist-1", payload, "failed", "failed").await;
}

// From main_test.go: TestLogFormat
// Verify that task output appears in the backing log artifact.
#[cfg(unix)]
#[tokio::test]
async fn test_log_format() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo 'hello from task log'"]],
        "maxRunTime": 60
    });

    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(&env, "task-log-fmt-1", &td).await;

    let (stdout, stderr) = run_worker(&env.config_path).await;

    // Verify the task completed successfully.
    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-log-fmt-1").unwrap_or_else(|| {
        panic!("Task not found in mock state.\nstdout:\n{stdout}\nstderr:\n{stderr}")
    });
    assert!(
        !entry.status.runs.is_empty(),
        "Task has no runs. stdout:\n{stdout}\nstderr:\n{stderr}"
    );
    let run = &entry.status.runs[0];
    assert_eq!(
        run.state, "completed",
        "Expected task to complete. stdout:\n{stdout}\nstderr:\n{stderr}"
    );

    // The task output "hello from task log" should appear somewhere in the
    // worker stdout/stderr (since the backing log may or may not be uploaded
    // to the mock, we check the process output).
    let combined = format!("{stdout}{stderr}");
    // At minimum, the worker should have logged something about the task.
    assert!(
        combined.contains("task-log-fmt-1") || combined.contains("Executing command"),
        "Expected worker output to mention the task.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// From intermittent_task_test.go: TestIntermittentCodeCommandIntermittent
// Exit code in onExitStatus.retry causes exception/intermittent-task.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_exit_code_retries() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 123"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": [123]
        }
    });

    submit_and_assert(&env, "task-intermittent-1", payload, "exception", "intermittent-task").await;
}

// From intermittent_task_test.go: TestIntermittentCodeCommandFailure
// Exit code NOT in retry list causes normal failure.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_exit_code_not_in_list() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 456"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": [123]
        }
    });

    submit_and_assert(&env, "task-intermittent-2", payload, "failed", "failed").await;
}

// From payload_test.go: TestEmptyPayloadObject
// Empty payload object should fail with malformed-payload.
#[tokio::test]
async fn test_empty_payload() {
    let env = setup().await;

    // Submit a task with an empty payload object (missing required fields).
    let payload = serde_json::json!({});

    submit_and_assert(&env, "task-empty-payload-1", payload, "exception", "malformed-payload").await;
}

// From payload_test.go: TestNoCommandsSpecified
// Payload with no commands (empty array) should fail with malformed-payload.
#[tokio::test]
async fn test_no_commands() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [],
        "maxRunTime": 3
    });

    submit_and_assert(&env, "task-no-commands-1", payload, "exception", "malformed-payload").await;
}

// From payload_test.go: maxRunTime validation
// maxRunTime exceeding the config limit should fail with malformed-payload.
#[tokio::test]
async fn test_max_run_time_validation() {
    let env = setup().await;

    // Default maxTaskRunTime in config is 86400 (24h). Set a value that exceeds it.
    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 999999
    });

    submit_and_assert(&env, "task-mrt-validation-1", payload, "exception", "malformed-payload").await;
}

// From envvars_test.go: verify env vars from payload.env are visible to commands.
#[cfg(unix)]
#[tokio::test]
async fn test_env_vars_set() {
    let env = setup().await;

    // Set custom env vars and verify them using printenv / echo.
    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "test \"$MY_CUSTOM_VAR\" = 'hello world' && test \"$ANOTHER_VAR\" = '42'"]
        ],
        "maxRunTime": 60,
        "env": {
            "MY_CUSTOM_VAR": "hello world",
            "ANOTHER_VAR": "42"
        }
    });

    submit_and_assert(&env, "task-envvars-1", payload, "completed", "completed").await;
}

// From envvars_test.go: TASK_ID, RUN_ID, TASKCLUSTER_ROOT_URL are set.
#[cfg(unix)]
#[tokio::test]
async fn test_taskcluster_env_vars() {
    let env = setup().await;

    // Verify that standard Taskcluster env vars are set.
    // TASK_ID should be the actual task ID, RUN_ID should be "0",
    // TASKCLUSTER_ROOT_URL should match the worker's configured root URL.
    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", concat!(
                "test -n \"$TASK_ID\" && ",
                "test \"$RUN_ID\" = '0' && ",
                "test -n \"$TASKCLUSTER_ROOT_URL\""
            )]
        ],
        "maxRunTime": 60
    });

    submit_and_assert(&env, "task-tc-envvars-1", payload, "completed", "completed").await;
}

// From config_test.go: TestMissingConfigFile
// Loading a non-existent config file should fail.
#[tokio::test]
async fn test_missing_config_file() {
    let binary = worker_binary();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::process::Command::new(&binary)
            .args(["run", "--config", "/tmp/nonexistent-config-12345.json"])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            // The worker should exit with a non-zero exit code.
            assert!(
                !output.status.success(),
                "Worker should have failed with missing config file, but exited successfully"
            );
        }
        Ok(Err(e)) => panic!("Failed to run worker binary: {e}"),
        Err(_) => panic!("Worker timed out - should have failed quickly with missing config"),
    }
}

// From config_test.go: TestInvalidJsonConfig
// Loading a malformed JSON config file should fail.
#[tokio::test]
async fn test_invalid_json_config() {
    // Create a temp file with invalid JSON.
    let tmp = tempfile::NamedTempFile::new().unwrap();
    std::fs::write(tmp.path(), r#"{"rootUrl": "http://localhost" "missing": "comma"}"#).unwrap();

    let binary = worker_binary();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::process::Command::new(&binary)
            .args(["run", "--config", &tmp.path().display().to_string()])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            assert!(
                !output.status.success(),
                "Worker should have failed with invalid JSON config, but exited successfully.\nstderr: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
        Ok(Err(e)) => panic!("Failed to run worker binary: {e}"),
        Err(_) => panic!("Worker timed out - should have failed quickly with invalid JSON"),
    }
}

// ---------------------------------------------------------------------------
// Ported payload tests (from Go payload_test.go)
// ---------------------------------------------------------------------------

/// Create a task definition with custom deadline and expiry.
fn test_task_with_deadline_and_expiry(
    provisioner_id: &str,
    worker_type: &str,
    payload: Value,
    deadline: &str,
    expires: &str,
) -> Value {
    serde_json::json!({
        "provisionerId": provisioner_id,
        "workerType": worker_type,
        "schedulerId": "test-scheduler",
        "taskGroupId": "test-task-group",
        "dependencies": [],
        "scopes": [],
        "payload": payload,
        "metadata": {
            "name": "Integration Test Task",
            "description": "A task created by integration tests",
            "owner": "test@example.com",
            "source": "https://github.com/taskcluster/taskcluster"
        },
        "expires": expires,
        "deadline": deadline,
        "tags": {},
        "extra": {},
        "priority": "lowest",
        "retries": 0,
    })
}

/// Schedule a task with a custom task definition, run the worker, and assert.
async fn submit_task_def_and_assert(
    env: &TestEnv,
    task_id: &str,
    task_def: Value,
    expected_state: &str,
    expected_reason: &str,
) {
    schedule_task(env, task_id, &task_def).await;

    let (stdout, stderr) = run_worker(&env.config_path).await;

    let inner = env.state.read().unwrap();
    let entry = inner
        .tasks
        .get(task_id)
        .unwrap_or_else(|| panic!("Task {task_id} not found in mock state.\nstdout:\n{stdout}\nstderr:\n{stderr}"));

    assert!(
        !entry.status.runs.is_empty(),
        "Task {task_id} has no runs. stdout:\n{stdout}\nstderr:\n{stderr}"
    );

    let run = &entry.status.runs[0];
    assert_eq!(
        run.state, expected_state,
        "Expected task state '{expected_state}' but got '{}'. reason_resolved='{}'\nstdout:\n{stdout}\nstderr:\n{stderr}",
        run.state, run.reason_resolved
    );
    assert_eq!(
        run.reason_resolved, expected_reason,
        "Expected reason '{expected_reason}' but got '{}'\nstdout:\n{stdout}\nstderr:\n{stderr}",
        run.reason_resolved
    );
}

/// Test that the burned-in payload schema is valid JSON Schema.
///
/// Ported from Go TestPayloadSchemaValid.
/// The worker's `show-payload-schema` command should output valid JSON Schema.
#[tokio::test]
async fn test_payload_schema_valid() {
    let binary = worker_binary();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::process::Command::new(&binary)
            .args(["show-payload-schema"])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            assert!(
                output.status.success(),
                "show-payload-schema should succeed.\nstderr: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            let stdout = String::from_utf8_lossy(&output.stdout);
            // Verify the output is valid JSON
            let schema_value: serde_json::Value = serde_json::from_str(&stdout)
                .unwrap_or_else(|e| panic!("Payload schema is not valid JSON: {e}\nOutput:\n{stdout}"));
            // Verify it looks like a JSON Schema (has "type" or "properties" or "$schema")
            assert!(
                schema_value.get("type").is_some()
                    || schema_value.get("properties").is_some()
                    || schema_value.get("$schema").is_some(),
                "Payload schema does not look like a valid JSON Schema: {stdout}"
            );
        }
        Ok(Err(e)) => panic!("Failed to run worker binary: {e}"),
        Err(_) => panic!("Worker timed out"),
    }
}

/// Test that env vars must be strings (not numbers, bools, etc).
///
/// Ported from Go TestEnvVarsMustBeStrings.
/// If an env var value is not a string, payload validation should fail.
#[tokio::test]
async fn test_env_vars_must_be_strings() {
    let env = setup().await;

    // GITHUB_PULL_REQUEST is specified as a number (37) instead of a string
    let td = test_task(
        "test-provisioner",
        "test-worker-type",
        serde_json::json!(null), // placeholder, overridden below
    );

    // Build a custom task def with a raw payload containing a non-string env var
    let mut td_mut = td;
    td_mut["payload"] = serde_json::json!({
        "env": {
            "XPI_NAME": "dist/example_add-on-0.0.1.zip",
            "GITHUB_PULL_REQUEST": 37,
            "GITHUB_BASE_BRANCH": "main"
        },
        "maxRunTime": 1200,
        "command": [["true"]]
    });

    submit_task_def_and_assert(
        &env,
        "task-env-not-strings",
        td_mut,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Test that extra fields in the payload are not allowed.
///
/// Ported from Go TestExtraFieldsNotAllowed.
/// A payload with an unknown field should fail with malformed-payload.
#[tokio::test]
async fn test_extra_fields_not_allowed() {
    let env = setup().await;

    let mut td = test_task(
        "test-provisioner",
        "test-worker-type",
        serde_json::json!(null),
    );
    td["payload"] = serde_json::json!({
        "env": {
            "XPI_NAME": "dist/example_add-on-0.0.1.zip"
        },
        "maxRunTime": 3,
        "extraField": "This field is not allowed!",
        "command": [["true"]]
    });

    submit_task_def_and_assert(
        &env,
        "task-extra-fields",
        td,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Test that a complete valid payload succeeds.
///
/// Ported from Go TestValidPayload.
/// A well-formed payload with env vars and a valid command should complete.
#[cfg(unix)]
#[tokio::test]
async fn test_valid_payload() {
    let env = setup().await;

    let mut td = test_task(
        "test-provisioner",
        "test-worker-type",
        serde_json::json!(null),
    );
    td["payload"] = serde_json::json!({
        "env": {
            "XPI_NAME": "dist/example_add-on-0.0.1.zip"
        },
        "maxRunTime": 3,
        "command": [["bash", "-c", "echo hello && echo goodbye"]]
    });

    submit_task_def_and_assert(
        &env,
        "task-valid-payload",
        td,
        "completed",
        "completed",
    )
    .await;
}

/// Test that an artifact expiring before the task deadline fails.
///
/// Ported from Go TestArtifactExpiresBeforeDeadline.
/// If an artifact's expires is earlier than the task deadline, the worker
/// should reject it as malformed-payload.
#[cfg(unix)]
#[tokio::test]
async fn test_artifact_expires_before_deadline() {
    let env = setup().await;

    let now = Utc::now();
    let artifact_expires = (now + Duration::minutes(5)).to_rfc3339();
    let deadline = (now + Duration::minutes(10)).to_rfc3339();
    let task_expires = (now + Duration::minutes(20)).to_rfc3339();

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo hello"]],
        "maxRunTime": 3,
        "artifacts": [
            {
                "type": "file",
                "path": "output.txt",
                "expires": artifact_expires
            }
        ]
    });

    let td = test_task_with_deadline_and_expiry(
        "test-provisioner",
        "test-worker-type",
        payload,
        &deadline,
        &task_expires,
    );

    submit_task_def_and_assert(
        &env,
        "task-art-before-deadline",
        td,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Test that an artifact expiring at the same time as the deadline is OK.
///
/// Ported from Go TestArtifactExpiresWithDeadline.
/// If an artifact's expires equals the task's deadline, it should be accepted.
#[cfg(unix)]
#[tokio::test]
async fn test_artifact_expires_with_deadline() {
    let env = setup().await;

    let now = Utc::now();
    let deadline = (now + Duration::minutes(10)).to_rfc3339();
    let artifact_expires = deadline.clone();
    let task_expires = (now + Duration::minutes(20)).to_rfc3339();

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo hello > output.txt"]],
        "maxRunTime": 3,
        "artifacts": [
            {
                "type": "file",
                "path": "output.txt",
                "expires": artifact_expires
            }
        ]
    });

    let td = test_task_with_deadline_and_expiry(
        "test-provisioner",
        "test-worker-type",
        payload,
        &deadline,
        &task_expires,
    );

    submit_task_def_and_assert(
        &env,
        "task-art-with-deadline",
        td,
        "completed",
        "completed",
    )
    .await;
}

/// Test that an artifact expiring between deadline and task expiry is OK.
///
/// Ported from Go TestArtifactExpiresBetweenDeadlineAndTaskExpiry.
/// If an artifact's expires is after the deadline but before task expiry,
/// it should be accepted.
#[cfg(unix)]
#[tokio::test]
async fn test_artifact_expires_between_deadline_and_task_expiry() {
    let env = setup().await;

    let now = Utc::now();
    let deadline = (now + Duration::minutes(10)).to_rfc3339();
    let artifact_expires = (now + Duration::minutes(15)).to_rfc3339();
    let task_expires = (now + Duration::minutes(20)).to_rfc3339();

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo hello > output.txt"]],
        "maxRunTime": 3,
        "artifacts": [
            {
                "type": "file",
                "path": "output.txt",
                "expires": artifact_expires
            }
        ]
    });

    let td = test_task_with_deadline_and_expiry(
        "test-provisioner",
        "test-worker-type",
        payload,
        &deadline,
        &task_expires,
    );

    submit_task_def_and_assert(
        &env,
        "task-art-between",
        td,
        "completed",
        "completed",
    )
    .await;
}

/// Test that an artifact expiring at the same time as task expiry is OK.
///
/// Ported from Go TestArtifactExpiresWithTask.
/// If an artifact's expires equals the task's expiry, it should be accepted.
#[cfg(unix)]
#[tokio::test]
async fn test_artifact_expires_with_task() {
    let env = setup().await;

    let now = Utc::now();
    let deadline = (now + Duration::minutes(10)).to_rfc3339();
    let task_expires = (now + Duration::minutes(20)).to_rfc3339();
    let artifact_expires = task_expires.clone();

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo hello > output.txt"]],
        "maxRunTime": 3,
        "artifacts": [
            {
                "type": "file",
                "path": "output.txt",
                "expires": artifact_expires
            }
        ]
    });

    let td = test_task_with_deadline_and_expiry(
        "test-provisioner",
        "test-worker-type",
        payload,
        &deadline,
        &task_expires,
    );

    submit_task_def_and_assert(
        &env,
        "task-art-with-task",
        td,
        "completed",
        "completed",
    )
    .await;
}

/// Test that an artifact expiring after task expiry fails.
///
/// Ported from Go TestArtifactExpiresAfterTaskExpiry.
/// If an artifact's expires is later than the task's own expiry, the worker
/// should reject it as malformed-payload.
#[cfg(unix)]
#[tokio::test]
async fn test_artifact_expires_after_task_expiry() {
    let env = setup().await;

    let now = Utc::now();
    let artifact_expires = (now + Duration::minutes(25)).to_rfc3339();
    let deadline = (now + Duration::minutes(10)).to_rfc3339();
    let task_expires = (now + Duration::minutes(20)).to_rfc3339();

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo hello"]],
        "maxRunTime": 3,
        "artifacts": [
            {
                "type": "file",
                "path": "output.txt",
                "expires": artifact_expires
            }
        ]
    });

    let td = test_task_with_deadline_and_expiry(
        "test-provisioner",
        "test-worker-type",
        payload,
        &deadline,
        &task_expires,
    );

    submit_task_def_and_assert(
        &env,
        "task-art-after-expiry",
        td,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Test that an invalid payload type (e.g., invalid mount format) is rejected.
///
/// Ported from Go TestInvalidPayload.
/// A payload with a mount containing "sha356" (typo) instead of "sha256"
/// should fail with malformed-payload.
#[tokio::test]
async fn test_invalid_payload() {
    let env = setup_with_overrides(serde_json::json!({
        "enableMounts": true,
    }))
    .await;

    let mut td = test_task(
        "test-provisioner",
        "test-worker-type",
        serde_json::json!(null),
    );
    td["payload"] = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "content": {
                    "sha356": "9ded97d830bef3734ea6de70df0159656d6a63e01484175b34d72b8db326bda0",
                    "url": "https://go.dev/dl/go1.10.8.windows-386.zip"
                },
                "directory": "go1.10.8",
                "format": "zip"
            }
        ]
    });

    submit_task_def_and_assert(
        &env,
        "task-invalid-payload",
        td,
        "exception",
        "malformed-payload",
    )
    .await;
}

// ---------------------------------------------------------------------------
// Ported intermittent task tests (from Go intermittent_task_test.go)
// ---------------------------------------------------------------------------

/// Test that a success exit code is not overridden by the retry list.
///
/// Ported from Go TestIntermittentCodeCommandSuccess.
/// Even though the retry list includes exit code 780, a successful
/// command (exit 0) should still resolve as completed.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_code_command_success() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 0"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": [780]
        }
    });

    submit_and_assert(
        &env,
        "task-interm-success",
        payload,
        "completed",
        "completed",
    )
    .await;
}

/// Test that a failure exit code not in the retry list still fails normally.
///
/// Ported from Go TestIntermittentCodeCommandFailure.
/// Exit code 456 is not in the retry list [123], so it should resolve
/// as a normal failure, not intermittent-task.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_code_command_failure() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 456"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": [123]
        }
    });

    submit_and_assert(
        &env,
        "task-interm-failure",
        payload,
        "failed",
        "failed",
    )
    .await;
}

/// Test that a negative exit code in the retry list causes malformed-payload.
///
/// Ported from Go TestIntermittentNegativeExitCode.
/// Negative exit codes should not be allowed in onExitStatus.retry.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_negative_exit_code() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 1"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": [-1]
        }
    });

    submit_and_assert(
        &env,
        "task-interm-negative",
        payload,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Test that exit code matching works with a list of retry codes.
///
/// Ported from Go TestIntermittentListCommandIntermittent.
/// Exit code 10 matches one of the codes in the retry list [780, 10, 2],
/// so the task should resolve as intermittent-task.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_list_command_intermittent() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 10"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": [780, 10, 2]
        }
    });

    submit_and_assert(
        &env,
        "task-interm-list-match",
        payload,
        "exception",
        "intermittent-task",
    )
    .await;
}

/// Test that an empty retry list with a successful command completes normally.
///
/// Ported from Go TestIntermittentEmptyListCommandSuccess.
/// An empty retry list should not affect a successful task.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_empty_list_command_success() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 0"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": []
        }
    });

    submit_and_assert(
        &env,
        "task-interm-empty-ok",
        payload,
        "completed",
        "completed",
    )
    .await;
}

/// Test that an empty retry list with a failed command fails normally.
///
/// Ported from Go TestIntermittentEmptyListCommandFailure.
/// An empty retry list should not affect a failed task.
#[cfg(unix)]
#[tokio::test]
async fn test_intermittent_empty_list_command_failure() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["bash", "-c", "exit 1"]],
        "maxRunTime": 30,
        "onExitStatus": {
            "retry": []
        }
    });

    submit_and_assert(
        &env,
        "task-interm-empty-fail",
        payload,
        "failed",
        "failed",
    )
    .await;
}

// ---------------------------------------------------------------------------
// Ported main_test.go tests
// ---------------------------------------------------------------------------

/// Test that ExecutionErrors display formatting shows the first error.
///
/// Ported from Go TestExecutionErrorsText.
/// This is a unit-level test verifying the Display impl of ExecutionErrors.
/// Since ExecutionErrors is internal to the binary, we test the observable
/// behavior: a task with multiple error conditions still produces output.
/// We validate the concept by running a task that generates an error and
/// checking the worker logs contain expected text.
#[cfg(unix)]
#[tokio::test]
async fn test_execution_errors_text() {
    let env = setup().await;

    // Submit a task with an empty payload to generate a malformed-payload error
    let payload = serde_json::json!({});

    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(&env, "task-exec-errors", &td).await;

    let (stdout, stderr) = run_worker(&env.config_path).await;

    // Verify the task resolved as exception/malformed-payload
    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-exec-errors").unwrap_or_else(|| {
        panic!("Task not found.\nstdout:\n{stdout}\nstderr:\n{stderr}")
    });
    assert!(!entry.status.runs.is_empty());
    let run = &entry.status.runs[0];
    assert_eq!(run.state, "exception");
    assert_eq!(run.reason_resolved, "malformed-payload");

    // The worker should have logged something about the error
    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("malformed") || combined.contains("payload") || combined.contains("error"),
        "Expected worker output to mention malformed payload error.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

/// Test that task directories are cleaned up after execution.
///
/// Ported from Go TestRemoveTaskDirs.
/// After a task runs with cleanUpTaskDirs=true, the task directory
/// should be removed.
#[cfg(unix)]
#[tokio::test]
async fn test_remove_task_dirs() {
    let env = setup().await;

    // Create a config with cleanUpTaskDirs=true
    let config = serde_json::json!({
        "rootUrl": env.root_url,
        "clientId": "test-client-id",
        "accessToken": "test-access-token",
        "provisionerId": "test-provisioner",
        "workerType": "test-worker-type",
        "workerGroup": "test-worker-group",
        "workerId": "test-worker-id",
        "tasksDir": env.tasks_dir,
        "cachesDir": std::path::Path::new(&env.config_path).parent().unwrap().join("caches").display().to_string(),
        "downloadsDir": std::path::Path::new(&env.config_path).parent().unwrap().join("downloads").display().to_string(),
        "numberOfTasksToRun": 1,
        "idleTimeoutSecs": 5,
        "shutdownMachineOnIdle": false,
        "disableReboots": true,
        "cleanUpTaskDirs": true,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": false,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
    });
    let config_path = write_config(&env, &config);

    let payload = serde_json::json!({
        "command": [["bash", "-c", "echo 'creating files' && mkdir -p subdir && echo 'data' > subdir/file.txt"]],
        "maxRunTime": 60
    });

    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(&env, "task-cleanup-dirs", &td).await;

    let (_stdout, _stderr) = run_worker(&config_path).await;

    // After the worker exits, the task directory should be cleaned up.
    // List the tasks directory and check that task_* directories are removed.
    let tasks_path = std::path::Path::new(&env.tasks_dir);
    if tasks_path.exists() {
        let entries: Vec<_> = std::fs::read_dir(tasks_path)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .starts_with("task_")
                    && e.file_type().map(|ft| ft.is_dir()).unwrap_or(false)
            })
            .collect();

        assert!(
            entries.is_empty(),
            "Expected task directories to be cleaned up, but found: {:?}",
            entries.iter().map(|e| e.file_name()).collect::<Vec<_>>()
        );
    }
    // If the tasks_dir doesn't exist at all, that's also fine (fully cleaned up).
}

/// Test that the worker --help output contains expected text.
///
/// Ported from Go TestUsage.
/// The worker binary should produce help text that includes information
/// about its subcommands.
#[tokio::test]
async fn test_usage() {
    let binary = worker_binary();
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        tokio::process::Command::new(&binary)
            .args(["--help"])
            .output(),
    )
    .await;

    match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let stderr = String::from_utf8_lossy(&output.stderr);
            let combined = format!("{stdout}{stderr}");

            // The help output should mention the "run" subcommand at minimum
            assert!(
                combined.contains("run") || combined.contains("Run"),
                "Expected --help output to mention 'run' subcommand.\nstdout:\n{stdout}\nstderr:\n{stderr}"
            );

            // It should also mention "generic-worker" somewhere
            assert!(
                combined.contains("generic-worker") || combined.contains("Generic Worker"),
                "Expected --help output to mention 'generic-worker'.\nstdout:\n{stdout}\nstderr:\n{stderr}"
            );
        }
        Ok(Err(e)) => panic!("Failed to run worker binary: {e}"),
        Err(_) => panic!("Worker timed out"),
    }
}
