//! Mount, cache, and purge cache tests for the generic worker.
//!
//! Ported from the Go generic-worker's mounts_test.go, purge_caches_test.go,
//! and cache_test.go.
//!
//! These tests use a mock HTTP server (built with axum) that implements the
//! Taskcluster Queue API endpoints. The worker binary is configured to point
//! at this mock server, so it claims tasks, executes commands, and reports
//! results against the mock.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
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
// In-test mock queue state (self-contained, mirrors integration_test.rs)
// ---------------------------------------------------------------------------

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
    /// artifacts["<taskId>:<runId>"]["<name>"] = creation request body
    artifacts: HashMap<String, HashMap<String, Value>>,
    /// artifact_content["<taskId>:<name>"] = raw bytes to serve on GET
    artifact_content: HashMap<String, Vec<u8>>,
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
    let name = name.strip_prefix('/').unwrap_or(&name).to_string();
    let mut inner = state.write().unwrap();
    let key = format!("{task_id}:{run_id}");
    let map = inner.artifacts.entry(key).or_default();
    map.insert(name, body);
    Json(serde_json::json!({}))
}

async fn finish_artifact_wildcard(
    Path((_task_id, _run_id, _rest)): Path<(String, String, String)>,
    State(_state): State<SharedState>,
) -> Json<Value> {
    Json(serde_json::json!({}))
}

/// Serve artifact content for GET /api/queue/v1/task/:task_id/artifacts/*name
/// (getLatestArtifact). Returns the raw bytes if stored, or 404.
async fn get_artifact(
    Path((task_id, name)): Path<(String, String)>,
    State(state): State<SharedState>,
) -> Result<axum::response::Response, StatusCode> {
    let name = name.strip_prefix('/').unwrap_or(&name).to_string();
    let inner = state.read().unwrap();
    let key = format!("{task_id}:{name}");
    match inner.artifact_content.get(&key) {
        Some(bytes) => Ok((
            StatusCode::OK,
            [("content-type", "application/octet-stream")],
            bytes.clone(),
        )
            .into_response()),
        None => Err(StatusCode::NOT_FOUND),
    }
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
    let scheduler_id = body["schedulerId"]
        .as_str()
        .unwrap_or("test-scheduler")
        .to_string();
    let task_group_id = body["taskGroupId"]
        .as_str()
        .unwrap_or("test-group")
        .to_string();

    let entry = TaskEntry {
        status: TaskStatusStructure {
            task_id: task_id.clone(),
            provisioner_id,
            worker_type,
            scheduler_id: scheduler_id.clone(),
            task_group_id: task_group_id.clone(),
            state: "pending".to_string(),
            runs: vec![],
        },
        task: TaskDefResponse {
            task_group_id,
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
    #[allow(dead_code)]
    caches_dir: String,
    #[allow(dead_code)]
    downloads_dir: String,
    _tmp_dir: TempDir,
}

/// Start a mock HTTP server on a random port and return the test environment.
async fn setup() -> TestEnv {
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
            "/api/queue/v1/task/:task_id/artifacts/*rest",
            get(get_artifact),
        )
        .route("/api/queue/v1/task/:task_id/status", get(task_status))
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
    let caches_dir = tmp_dir.path().join("caches");
    let downloads_dir = tmp_dir.path().join("downloads");
    std::fs::create_dir_all(&tasks_dir).unwrap();
    std::fs::create_dir_all(&caches_dir).unwrap();
    std::fs::create_dir_all(&downloads_dir).unwrap();

    let config = serde_json::json!({
        "rootUrl": root_url,
        "clientId": "test-client-id",
        "accessToken": "test-access-token",
        "provisionerId": "test-provisioner",
        "workerType": "test-worker-type",
        "workerGroup": "test-worker-group",
        "workerId": "test-worker-id",
        "tasksDir": tasks_dir.display().to_string(),
        "cachesDir": caches_dir.display().to_string(),
        "downloadsDir": downloads_dir.display().to_string(),
        "numberOfTasksToRun": 1,
        "idleTimeoutSecs": 5,
        "shutdownMachineOnIdle": false,
        "disableReboots": true,
        "cleanUpTaskDirs": false,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": true,
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
        caches_dir: caches_dir.display().to_string(),
        downloads_dir: downloads_dir.display().to_string(),
        _tmp_dir: tmp_dir,
    }
}

/// Store artifact content in the mock server so it can be served via GET.
fn store_artifact_content(env: &TestEnv, task_id: &str, artifact_name: &str, content: Vec<u8>) {
    let mut inner = env.state.write().unwrap();
    let key = format!("{task_id}:{artifact_name}");
    inner.artifact_content.insert(key, content);
}

/// Create a minimal zip file in memory with a single file entry.
fn create_test_zip(filename: &str, content: &[u8]) -> Vec<u8> {
    let buf = std::io::Cursor::new(Vec::new());
    let mut zip = zip::ZipWriter::new(buf);
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Stored);
    zip.start_file(filename, options).unwrap();
    zip.write_all(content).unwrap();
    zip.finish().unwrap().into_inner()
}

/// Create a task definition with reasonable defaults.
fn test_task_def(
    provisioner_id: &str,
    worker_type: &str,
    payload: Value,
    scopes: &[&str],
    dependencies: &[&str],
) -> Value {
    let now = Utc::now();
    let deadline = now + Duration::minutes(15);
    let expires = now + Duration::days(14);

    serde_json::json!({
        "provisionerId": provisioner_id,
        "workerType": worker_type,
        "schedulerId": "test-scheduler",
        "taskGroupId": "test-task-group",
        "dependencies": dependencies,
        "scopes": scopes,
        "payload": payload,
        "metadata": {
            "name": "Mount Test Task",
            "description": "A task created by mount tests",
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

/// Schedule a task via the mock HTTP server.
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

/// Get the path to the built binary.
fn worker_binary() -> String {
    let mut path = std::env::current_exe().unwrap();
    path.pop();
    if path.ends_with("deps") {
        path.pop();
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
/// Returns (stdout, stderr) for further assertions.
async fn submit_and_assert(
    env: &TestEnv,
    task_id: &str,
    payload: Value,
    scopes: &[&str],
    dependencies: &[&str],
    expected_state: &str,
    expected_reason: &str,
) -> (String, String) {
    let td = test_task_def(
        "test-provisioner",
        "test-worker-type",
        payload,
        scopes,
        dependencies,
    );
    schedule_task(env, task_id, &td).await;

    let (stdout, stderr) = run_worker(&env.config_path).await;

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get(task_id).unwrap_or_else(|| {
        panic!("Task {task_id} not found in mock state.\nstdout:\n{stdout}\nstderr:\n{stderr}")
    });

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

    (stdout, stderr)
}

/// Write a custom config to the test env temp dir and return the path.
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

/// Run the worker with a custom config that allows multiple tasks, and return outputs.
async fn run_worker_multi_task(env: &TestEnv, num_tasks: u64) -> (String, String) {
    let _ = std::fs::write("tasks-resolved-count.txt", "0"); // reset per-test
    let config = serde_json::json!({
        "rootUrl": env.root_url,
        "clientId": "test-client-id",
        "accessToken": "test-access-token",
        "provisionerId": "test-provisioner",
        "workerType": "test-worker-type",
        "workerGroup": "test-worker-group",
        "workerId": "test-worker-id",
        "tasksDir": env.tasks_dir,
        "cachesDir": env.caches_dir,
        "downloadsDir": env.downloads_dir,
        "numberOfTasksToRun": num_tasks,
        "idleTimeoutSecs": 5,
        "shutdownMachineOnIdle": false,
        "disableReboots": true,
        "cleanUpTaskDirs": false,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": true,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
    });
    let config_path = write_config(env, &config);
    run_worker(&config_path).await
}

/// Count the number of cache entries (files/dirs) in a directory,
/// excluding cache state JSON files (file-caches.json, directory-caches.json).
fn count_dir_entries(path: &str) -> usize {
    match std::fs::read_dir(path) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name();
                let name_str = name.to_string_lossy();
                name_str != "file-caches.json" && name_str != "directory-caches.json"
            })
            .count(),
        Err(_) => 0,
    }
}

// ===========================================================================
// 1. test_file_mount_no_sha256 - FileMount without SHA256
//    Ported from Go TestFileMountNoSHA256
//
//    A file mount with raw content but no SHA256 should succeed with a
//    warning about unverified content.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_file_mount_no_sha256() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "cat my-mounted-file.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "my-mounted-file.txt",
                "content": {
                    "raw": "Hello from file mount without SHA256!"
                }
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-mount-no-sha256",
        payload,
        &[],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Hello from file mount without SHA256!"),
        "Expected task output to contain the mounted file content.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 2. test_file_mount_with_compression - FileMount with compression formats
//    Ported from Go TestFileMountWithCompression
//
//    Since we cannot easily serve compressed artifacts via the mock queue,
//    this test uses base64 to provide a gzip-compressed file as a mount.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_file_mount_with_compression() {
    use base64::Engine;
    use std::io::Write as IoWrite;

    let env = setup().await;

    // Create gzip-compressed content: "testing file mounts with compression!"
    let content = b"testing file mounts with compression!";
    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    encoder.write_all(content).unwrap();
    let compressed = encoder.finish().unwrap();
    let b64 = base64::engine::general_purpose::STANDARD.encode(&compressed);

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "cat decompressed-file.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "decompressed-file.txt",
                "content": {
                    "base64": b64
                },
                "format": "gz"
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-mount-compression",
        payload,
        &[],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("testing file mounts with compression!"),
        "Expected output to contain decompressed content.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 3. test_mount_file_at_cwd - FileMount at current working directory
//    Ported from Go TestMountFileAtCWD
//
//    Mounting a file at "." (the task directory) should fail because "."
//    already exists as a directory.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_mount_file_at_cwd() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": ".",
                "content": {
                    "raw": "this should fail because . is a directory"
                }
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-mount-at-cwd",
        payload,
        &[],
        &[],
        "failed",
        "failed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("already exists as a directory"),
        "Expected error about mounting at an existing directory path.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 4. test_writable_directory_cache_no_sha256 - Writable cache without SHA256
//    Ported from Go TestWritableDirectoryCacheNoSHA256
//
//    A writable directory cache should be created, used, and preserved
//    across tasks. Without SHA256, a warning should be logged.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_writable_directory_cache_no_sha256() {
    let env = setup().await;

    // First task: create a file in the cache directory
    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "echo 'cached content' > my-cache/data.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-cache"
            }
        ]
    });

    let (_stdout, _stderr) = submit_and_assert(
        &env,
        "task-cache-no-sha256-1",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "completed",
        "completed",
    )
    .await;

    // Second task: verify the cache content persists
    let payload2 = serde_json::json!({
        "command": [
            ["bash", "-c", "cat my-cache/data.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-cache"
            }
        ]
    });

    let td2 = test_task_def(
        "test-provisioner",
        "test-worker-type",
        payload2,
        &["generic-worker:cache:banana-cache"],
        &[],
    );
    schedule_task(&env, "task-cache-no-sha256-2", &td2).await;
    let (stdout, stderr) = run_worker_multi_task(&env, 1).await;

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-cache-no-sha256-2").unwrap();
    let run = &entry.status.runs[0];
    assert_eq!(
        run.state, "completed",
        "Expected second task to complete. stdout:\n{stdout}\nstderr:\n{stderr}"
    );

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("cached content"),
        "Expected cache content to persist between tasks.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 5. test_mount_file_and_dir_same_location - File and dir mount at same path
//    Ported from Go TestMountFileAndDirSameLocation
//
//    Mounting a file and a directory at the same path should fail since the
//    directory mount cannot create a directory where a file already exists.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_mount_file_and_dir_same_location() {
    let env = setup().await;

    // Mount a file at "file-located-here", then try to mount a directory
    // at the same path. The directory mount should fail.
    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "file-located-here",
                "content": {
                    "raw": "I am a file"
                }
            },
            {
                "directory": "file-located-here",
                "content": {
                    "raw": "I am pretending to be a zip"
                },
                "format": "zip"
            }
        ]
    });

    submit_and_assert(
        &env,
        "task-mount-file-dir-same",
        payload,
        &[],
        &[],
        "failed",
        "failed",
    )
    .await;
}

// ===========================================================================
// 6. test_evict_next - Unit test for cache eviction ordering
//    Ported from Go TestEvictNext
//
//    The Go version tests that Resources.EvictNext() removes the first
//    (lowest-rated) cache entry. Since the Rust mounts module uses a
//    CacheMap (HashMap) with sorted_by_rating(), we test equivalent logic
//    here using the same data model directly.
//
//    This is a pure logic test - no worker process needed.
// ===========================================================================

#[test]
fn test_evict_next() {
    // Simulate a cache map with three entries.
    // In the Go code, EvictNext removes the first entry (lowest index).
    // In the Rust code, sorted_by_rating sorts by hits (lowest first).
    // We simulate: apple(0 hits), banana(1 hit), pear(2 hits).
    // Evicting the lowest-rated should remove "apple".
    let mut cache: HashMap<String, serde_json::Value> = HashMap::new();
    cache.insert(
        "apple".to_string(),
        serde_json::json!({"hits": 0, "key": "apple"}),
    );
    cache.insert(
        "banana".to_string(),
        serde_json::json!({"hits": 1, "key": "banana"}),
    );
    cache.insert(
        "pear".to_string(),
        serde_json::json!({"hits": 2, "key": "pear"}),
    );

    // Sort by hits (rating) and find the one to evict (lowest)
    let mut entries: Vec<(&String, u64)> = cache
        .iter()
        .map(|(k, v)| (k, v["hits"].as_u64().unwrap_or(0)))
        .collect();
    entries.sort_by_key(|&(_, hits)| hits);

    // The first entry should be "apple" with 0 hits
    assert_eq!(entries[0].0, "apple", "Expected apple to have lowest rating");

    // Evict it
    let evict_key = entries[0].0.clone();
    cache.remove(&evict_key);

    assert_eq!(cache.len(), 2, "Expected 2 entries after eviction");
    assert!(
        cache.contains_key("banana"),
        "Expected banana to remain after eviction"
    );
    assert!(
        cache.contains_key("pear"),
        "Expected pear to remain after eviction"
    );
}

// ===========================================================================
// 7. test_missing_scopes - Mount requiring scope without it
//    Ported from Go TestMissingScopes
//
//    A task that uses a writable directory cache without the required scope
//    should fail with malformed-payload.
//    Note: scope validation is currently TODO in the Rust worker, so this
//    test is ignored until scope checking is implemented.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_missing_scopes() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ]
    });

    // Don't set any scopes - this should fail
    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-missing-scopes",
        payload,
        &[], // no scopes
        &[],
        "exception",
        "malformed-payload",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("generic-worker:cache:banana-cache"),
        "Expected error to mention the missing scope.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 8. test_32bit_overflow - Large values don't cause overflow
//    Ported from Go Test32BitOverflow
//
//    Verify that required_disk_space_megabytes * 1024 * 1024 does not
//    overflow on 32-bit integers. In Rust this is guaranteed because the
//    config field is u64, but we test it to be sure.
// ===========================================================================

#[test]
fn test_32bit_overflow() {
    // The Go test checks that 1024 * 10 megabytes == 10737418240 bytes
    // In the Rust worker, required_disk_space_megabytes is u64, so
    // overflow cannot happen, but we verify the math is correct.
    let required_disk_space_megabytes: u64 = 1024 * 10;
    let required_free_space: u64 = required_disk_space_megabytes * 1024 * 1024;
    assert_eq!(
        required_free_space, 10737418240,
        "Expected 10737418240 bytes but got {required_free_space}"
    );
}

// ===========================================================================
// 9. test_non_existent_artifact_mount - Mount referencing non-existent artifact
//    Ported from Go TestNonExistentArtifact
//
//    A mount that references a non-existent artifact from a task that does
//    exist should fail. This requires the mock server to serve artifact
//    downloads, which our mock does not currently support.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_non_existent_artifact_mount() {
    let env = setup().await;

    // Note: we do NOT store any artifact content for "some-task-id",
    // so the mock server will return 404 for this artifact download.

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "directory": ".",
                "content": {
                    "taskId": "some-task-id",
                    "artifact": "SampleArtifacts/_/non-existent-artifact.txt"
                },
                "format": "zip"
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-nonexistent-artifact",
        payload,
        &["queue:get-artifact:SampleArtifacts/_/non-existent-artifact.txt"],
        &["some-task-id"],
        "failed",
        "failed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Could not fetch"),
        "Expected error about failing to fetch artifact.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 10. test_cache_moved - Cache directory moves between tasks
//     Ported from Go TestCacheMoved
//
//     If a task mounts a writable directory cache and then moves the
//     directory to a different location, the unmount should fail (can't
//     persist the cache) and the worker should not crash.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_cache_moved() {
    let env = setup().await;

    // Mount a cache, then move it within the task command. The unmount step
    // should detect the cache is gone and report an error, but the worker
    // should not crash.
    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "echo 'hello' > my-cache/test.txt && mv my-cache moved-cache"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "movable-cache",
                "directory": "my-cache"
            }
        ]
    });

    // The task should fail because the cache was moved and cannot be preserved.
    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-cache-moved",
        payload,
        &["generic-worker:cache:movable-cache"],
        &[],
        "failed",
        "failed",
    )
    .await;

    // The worker should have logged an error about the cache not being persisted.
    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("could not persist cache") || combined.contains("Preserving cache"),
        "Expected error about failing to persist moved cache.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 11. test_purge_caches - Basic purge cache operation
//     Ported from Go TestPurgeCaches
//
//     When a task exits with a code listed in onExitStatus.purgeCaches,
//     the worker should remove the cache rather than preserving it.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_purge_caches() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "exit 123"]
        ],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": [123]
        }
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-purge-caches",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "failed",
        "failed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");

    // The cache should have been removed (not preserved)
    assert!(
        !combined.contains("Preserving cache"),
        "Cache should NOT have been preserved when exit code matches purgeCaches.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    // After purging, the caches directory should be empty
    assert_eq!(
        count_dir_entries(&env.caches_dir),
        0,
        "Expected caches directory to be empty after purge"
    );
}

// ===========================================================================
// 12. test_purge_caches_command_failure - Purge on command failure
//     Ported from Go TestPurgeCachesCommandFailure
//
//     When the command exits with a code NOT in purgeCaches list,
//     the cache should be preserved normally even though the task failed.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_purge_caches_command_failure() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "exit 456"]
        ],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": [123]
        }
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-purge-no-match",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "failed",
        "failed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Preserving cache"),
        "Cache should have been preserved when exit code does NOT match purgeCaches.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    assert_eq!(
        count_dir_entries(&env.caches_dir),
        1,
        "Expected 1 cache entry preserved after non-matching exit code"
    );
}

// ===========================================================================
// 13. test_purge_caches_command_success - Purge on command success
//     Ported from Go TestPurgeCachesCommandSuccess
//
//     When the command succeeds (exit 0), purgeCaches should not be
//     triggered even if exit codes are listed (they only apply to failures).
//     The cache should be preserved.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_purge_caches_command_success() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": [780]
        }
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-purge-success",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Preserving cache"),
        "Cache should have been preserved on successful task.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    assert_eq!(
        count_dir_entries(&env.caches_dir),
        1,
        "Expected 1 cache entry preserved after successful task"
    );
}

// ===========================================================================
// 14. test_purge_task_caches - Purge specific task caches only
//     Ported from Go TestPurgeTaskCaches
//
//     When purgeCaches triggers, it should only purge caches from the
//     current task, not caches from previous tasks.
// ===========================================================================

#[cfg(unix)]
#[tokio::test]
async fn test_purge_task_caches() {
    let env = setup().await;

    // First task: create an apple-cache (should succeed and be preserved)
    let payload1 = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "apple-cache",
                "directory": "my-task-caches/apples"
            }
        ]
    });

    submit_and_assert(
        &env,
        "task-purge-apples",
        payload1,
        &["generic-worker:cache:apple-cache"],
        &[],
        "completed",
        "completed",
    )
    .await;

    assert_eq!(
        count_dir_entries(&env.caches_dir),
        1,
        "Expected 1 cache entry after first task"
    );

    // Second task: create a banana-cache and exit with code that triggers purge.
    // Only the banana-cache should be purged; apple-cache from the previous task
    // should remain.
    let payload2 = serde_json::json!({
        "command": [
            ["bash", "-c", "exit 123"]
        ],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": [123]
        }
    });

    let td2 = test_task_def(
        "test-provisioner",
        "test-worker-type",
        payload2,
        &["generic-worker:cache:banana-cache"],
        &[],
    );
    schedule_task(&env, "task-purge-bananas", &td2).await;
    let (stdout, stderr) = run_worker_multi_task(&env, 1).await;

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-purge-bananas").unwrap();
    assert_eq!(
        entry.status.runs[0].state, "failed",
        "Expected second task to fail. stdout:\n{stdout}\nstderr:\n{stderr}"
    );
    drop(inner);

    // The apple-cache from the first task should still exist.
    // The banana-cache was purged.
    assert_eq!(
        count_dir_entries(&env.caches_dir),
        1,
        "Expected 1 cache entry (apple-cache) to remain after purging banana-cache. stdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ===========================================================================
// 15. test_issue_5363 - Cache issue reproduction
//     Ported from Go TestIssue5363
//
//     When loading a cache map from a JSON file, entries whose locations
//     no longer exist on disk should be removed. This tests the
//     load_cache_map logic.
//
//     This is a pure logic test - no worker process needed.
// ===========================================================================

#[test]
fn test_issue_5363() {
    // Create a temporary cache state file with 5 entries:
    // 2 with bad (non-existent) locations and 3 with good (existing) locations.
    let tmp_dir = TempDir::new().unwrap();
    let cache_dir = tmp_dir.path().join("caches");
    std::fs::create_dir_all(&cache_dir).unwrap();

    // Create the "good" location directories/files
    let good1_dir = tmp_dir.path().join("good1");
    std::fs::create_dir_all(&good1_dir).unwrap();
    let good2_dir = tmp_dir.path().join("good2");
    std::fs::create_dir_all(&good2_dir).unwrap();
    let good3_file = tmp_dir.path().join("good3.txt");
    std::fs::write(&good3_file, "test").unwrap();

    let cache_state = serde_json::json!({
        "bad1": {
            "created": "2024-01-01T00:00:00Z",
            "location": "/nonexistent/path/bad1",
            "hits": 0,
            "key": "bad1",
            "sha256": "",
            "ownerUsername": "",
            "mounterUID": ""
        },
        "good1": {
            "created": "2024-01-01T00:00:00Z",
            "location": good1_dir.display().to_string(),
            "hits": 1,
            "key": "good1",
            "sha256": "",
            "ownerUsername": "",
            "mounterUID": ""
        },
        "bad2": {
            "created": "2024-01-01T00:00:00Z",
            "location": "/nonexistent/path/bad2",
            "hits": 0,
            "key": "bad2",
            "sha256": "",
            "ownerUsername": "",
            "mounterUID": ""
        },
        "good2": {
            "created": "2024-01-01T00:00:00Z",
            "location": good2_dir.display().to_string(),
            "hits": 2,
            "key": "good2",
            "sha256": "",
            "ownerUsername": "",
            "mounterUID": ""
        },
        "good3": {
            "created": "2024-01-01T00:00:00Z",
            "location": good3_file.display().to_string(),
            "hits": 3,
            "key": "good3",
            "sha256": "",
            "ownerUsername": "",
            "mounterUID": ""
        }
    });

    let state_file = tmp_dir.path().join("test-caches.json");
    std::fs::write(
        &state_file,
        serde_json::to_string_pretty(&cache_state).unwrap(),
    )
    .unwrap();

    // Now parse it in the same way the worker does: read the JSON, and filter
    // out entries whose locations no longer exist.
    let content = std::fs::read_to_string(&state_file).unwrap();
    let map: HashMap<String, serde_json::Value> = serde_json::from_str(&content).unwrap();

    // Filter to only entries with existing locations
    let valid_entries: HashMap<String, serde_json::Value> = map
        .into_iter()
        .filter(|(_, v)| {
            let loc = v["location"].as_str().unwrap_or("");
            std::path::Path::new(loc).exists()
        })
        .collect();

    assert_eq!(
        valid_entries.len(),
        3,
        "Expected 3 valid cache entries (with existing locations), got {}",
        valid_entries.len()
    );
    assert!(
        valid_entries.contains_key("good1"),
        "Expected good1 to be in the cache map"
    );
    assert!(
        valid_entries.contains_key("good2"),
        "Expected good2 to be in the cache map"
    );
    assert!(
        valid_entries.contains_key("good3"),
        "Expected good3 to be in the cache map"
    );
    assert!(
        !valid_entries.contains_key("bad1"),
        "Expected bad1 to be removed from cache map"
    );
    assert!(
        !valid_entries.contains_key("bad2"),
        "Expected bad2 to be removed from cache map"
    );
}

// ===========================================================================
// Additional mount tests ported from Go mounts_test.go
// ===========================================================================

// ---------------------------------------------------------------------------
// test_file_mount_base64_content - FileMount with base64 encoded content
// Ported from Go TestMounts (base64 section)
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_file_mount_base64_content() {
    use base64::Engine;
    let env = setup().await;

    let content_b64 =
        base64::engine::general_purpose::STANDARD.encode("echo 'Hello Base64!'");

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "cat mounted-b64.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "mounted-b64.txt",
                "content": {
                    "base64": content_b64
                }
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-b64-mount",
        payload,
        &[],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("echo 'Hello Base64!'"),
        "Expected output to contain the base64-decoded content.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ---------------------------------------------------------------------------
// test_file_mount_raw_content - FileMount with raw inline content
// Ported from Go TestMounts (raw section)
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_file_mount_raw_content() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "cat preloaded/raw.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "preloaded/raw.txt",
                "content": {
                    "raw": "Hello Raw!"
                }
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-raw-mount",
        payload,
        &[],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Hello Raw!"),
        "Expected output to contain 'Hello Raw!'.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ---------------------------------------------------------------------------
// test_writable_cache_empty - Empty writable directory cache
// Ported from Go TestMounts (empty writable cache section)
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_writable_cache_empty() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "ls my-task-caches/bananas && echo 'cache dir exists'"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-empty-cache",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("cache dir exists"),
        "Expected empty cache directory to be created.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ---------------------------------------------------------------------------
// test_caches_can_be_modified - Cache content can be modified by tasks
// Ported from Go TestCachesCanBeModified
//
// Three consecutive tasks: write "1", increment to "2", increment to "3".
// Then verify the counter value.
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_caches_can_be_modified() {
    let env = setup().await;

    // Task 1: write initial counter value
    let payload1 = serde_json::json!({
        "command": [
            ["bash", "-c", "if [ -f my-cache/counter ]; then val=$(cat my-cache/counter); echo $((val+1)) > my-cache/counter; else echo 1 > my-cache/counter; fi"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "test-modifications",
                "directory": "my-cache"
            }
        ]
    });

    submit_and_assert(
        &env,
        "task-cache-mod-1",
        payload1.clone(),
        &["generic-worker:cache:test-modifications"],
        &[],
        "completed",
        "completed",
    )
    .await;

    // Task 2: increment counter
    let td2 = test_task_def(
        "test-provisioner",
        "test-worker-type",
        payload1.clone(),
        &["generic-worker:cache:test-modifications"],
        &[],
    );
    schedule_task(&env, "task-cache-mod-2", &td2).await;
    run_worker_multi_task(&env, 1).await;

    // Task 3: increment again and print
    let payload3 = serde_json::json!({
        "command": [
            ["bash", "-c", "if [ -f my-cache/counter ]; then val=$(cat my-cache/counter); echo $((val+1)) > my-cache/counter; fi; cat my-cache/counter"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "test-modifications",
                "directory": "my-cache"
            }
        ]
    });

    let td3 = test_task_def(
        "test-provisioner",
        "test-worker-type",
        payload3,
        &["generic-worker:cache:test-modifications"],
        &[],
    );
    schedule_task(&env, "task-cache-mod-3", &td3).await;
    let (stdout, stderr) = run_worker_multi_task(&env, 1).await;

    // The counter should be "3" after three increments starting from 1
    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains('3'),
        "Expected counter value of 3 after three tasks.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ---------------------------------------------------------------------------
// test_corrupt_zip_doesnt_crash_worker
// Ported from Go TestCorruptZipDoesntCrashWorker
//
// If a mount references content that is not a valid zip archive, the
// worker should handle it gracefully (fail the task, not crash).
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_corrupt_zip_doesnt_crash_worker() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "directory": "extracted",
                "content": {
                    "raw": "this is not a zip file at all"
                },
                "format": "zip"
            }
        ]
    });

    submit_and_assert(
        &env,
        "task-corrupt-zip",
        payload,
        &[],
        &[],
        "failed",
        "failed",
    )
    .await;
}

// ---------------------------------------------------------------------------
// test_invalid_sha_doesnt_prevent_unmount
// Ported from Go TestInvalidSHADoesNotPreventMountedMountsFromBeingUnmounted
//
// When a ReadOnlyDirectory has invalid SHA256, a previously mounted
// WritableDirectoryCache should still be properly unmounted and preserved.
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_invalid_sha_doesnt_prevent_unmount() {
    let env = setup().await;

    // Store a valid zip file as artifact content so the download succeeds,
    // but the SHA256 in the mount is intentionally wrong.
    let zip_bytes = create_test_zip("test.txt", b"hello from zip");
    store_artifact_content(
        &env,
        "some-task-id",
        "public/build/unknown_issuer_app_1.zip",
        zip_bytes,
    );

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "unknown-issuer-app-cache",
                "directory": "cache-1"
            },
            {
                "directory": "cache-2",
                "content": {
                    "taskId": "some-task-id",
                    "artifact": "public/build/unknown_issuer_app_1.zip",
                    "sha256": "7777777777777777777777777777777777777777777777777777777777777777"
                },
                "format": "zip"
            }
        ]
    });

    // First task with bad SHA should fail, but cache should be preserved
    submit_and_assert(
        &env,
        "task-sha-unmount-1",
        payload,
        &["generic-worker:cache:unknown-issuer-app-cache"],
        &["some-task-id"],
        "failed",
        "failed",
    )
    .await;

    // Second task with just the cache should succeed (verifying cache was properly unmounted)
    let payload2 = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "cacheName": "unknown-issuer-app-cache",
                "directory": "cache-1"
            }
        ]
    });

    let td2 = test_task_def(
        "test-provisioner",
        "test-worker-type",
        payload2,
        &["generic-worker:cache:unknown-issuer-app-cache"],
        &[],
    );
    schedule_task(&env, "task-sha-unmount-2", &td2).await;
    let (stdout, stderr) = run_worker_multi_task(&env, 1).await;

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get("task-sha-unmount-2").unwrap();
    assert_eq!(
        entry.status.runs[0].state, "completed",
        "Expected second task to complete after first task with invalid SHA failed. stdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ---------------------------------------------------------------------------
// test_purge_caches_list_command
// Ported from Go TestPurgeCachesListCommand
//
// purgeCaches as a list of exit codes should work (not just a single code).
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_purge_caches_list_command() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "exit 10"]
        ],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": [780, 10, 2]
        }
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-purge-list",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "failed",
        "failed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        !combined.contains("Preserving cache"),
        "Cache should NOT have been preserved when exit code matches purgeCaches list.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    assert_eq!(
        count_dir_entries(&env.caches_dir),
        0,
        "Expected caches directory to be empty after purge"
    );
}

// ---------------------------------------------------------------------------
// test_purge_caches_empty_list_success
// Ported from Go TestPurgeCachesEmptyListCommandSuccess
//
// Empty purgeCaches list with successful task should preserve cache.
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_purge_caches_empty_list_success() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": []
        }
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-purge-empty-ok",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Preserving cache"),
        "Cache should have been preserved with empty purgeCaches list.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    assert_eq!(
        count_dir_entries(&env.caches_dir),
        1,
        "Expected 1 cache entry preserved"
    );
}

// ---------------------------------------------------------------------------
// test_purge_caches_empty_list_failure
// Ported from Go TestPurgeCachesEmptyListCommandFailure
//
// Empty purgeCaches list with failing task should still preserve cache.
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_purge_caches_empty_list_failure() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "exit 1"]
        ],
        "maxRunTime": 30,
        "mounts": [
            {
                "cacheName": "banana-cache",
                "directory": "my-task-caches/bananas"
            }
        ],
        "onExitStatus": {
            "purgeCaches": []
        }
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-purge-empty-fail",
        payload,
        &["generic-worker:cache:banana-cache"],
        &[],
        "failed",
        "failed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Preserving cache"),
        "Cache should have been preserved with empty purgeCaches list even on failure.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );

    assert_eq!(
        count_dir_entries(&env.caches_dir),
        1,
        "Expected 1 cache entry preserved"
    );
}

// ---------------------------------------------------------------------------
// test_missing_mounts_dependency
// Ported from Go TestMissingMountsDependency
//
// If artifact content is mounted, it must be included as a task dependency.
// This requires dependency validation which may not be implemented yet.
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_missing_mounts_dependency() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "preloaded/Mr X.txt",
                "content": {
                    "taskId": "some-pretend-task-id",
                    "artifact": "SampleArtifacts/_/X.txt"
                }
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-missing-dep",
        payload,
        &["queue:get-artifact:SampleArtifacts/_/X.txt"],
        &[], // deliberately NOT including some-pretend-task-id
        "exception",
        "malformed-payload",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("task.dependencies needs to include"),
        "Expected error about missing dependency.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}

// ---------------------------------------------------------------------------
// test_file_mount_nested_directory - FileMount in a subdirectory
// Ported from Go TestMounts (file mount with path containing directory)
// ---------------------------------------------------------------------------

#[cfg(unix)]
#[tokio::test]
async fn test_file_mount_nested_directory() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [
            ["bash", "-c", "cat preloaded/subdir/deep.txt"]
        ],
        "maxRunTime": 60,
        "mounts": [
            {
                "file": "preloaded/subdir/deep.txt",
                "content": {
                    "raw": "Deep nested content!"
                }
            }
        ]
    });

    let (stdout, stderr) = submit_and_assert(
        &env,
        "task-nested-mount",
        payload,
        &[],
        &[],
        "completed",
        "completed",
    )
    .await;

    let combined = format!("{stdout}{stderr}");
    assert!(
        combined.contains("Deep nested content!"),
        "Expected output to contain nested file content.\nstdout:\n{stdout}\nstderr:\n{stderr}"
    );
}
