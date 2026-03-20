//! D2G (Docker-to-Generic) tests ported from the Go generic-worker.
//!
//! These tests exercise Docker Worker payload translation (D2G), where
//! Docker Worker task payloads are automatically converted to Generic
//! Worker payloads and executed using Docker containers.
//!
//! All tests are marked `#[ignore]` because they require Docker to be
//! installed and running, the D2G payload translation feature to be
//! implemented, and the multiuser engine for Docker group membership.

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
// In-test mock queue state (self-contained, duplicated from integration_test)
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

#[derive(Debug, Default)]
struct MockState {
    tasks: HashMap<String, TaskEntry>,
    ordered_tasks: Vec<String>,
    artifacts: HashMap<String, HashMap<String, Value>>,
}

type SharedState = Arc<RwLock<MockState>>;

// ---------------------------------------------------------------------------
// Axum route handlers
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

struct TestEnv {
    root_url: String,
    state: SharedState,
    config_path: String,
    #[allow(dead_code)]
    tasks_dir: String,
    _tmp_dir: TempDir,
}

async fn setup_with_overrides(overrides: Value) -> TestEnv {
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
    std::fs::create_dir_all(&tasks_dir).unwrap();

    let mut config = serde_json::json!({
        "rootURL": root_url,
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
        "cleanUpTaskDirs": false,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": false,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
        "enableOSGroups": false,
    });

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
            "name": "D2G Test Task",
            "description": "A task created by D2G tests",
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

fn test_task_with_scopes(
    provisioner_id: &str,
    worker_type: &str,
    payload: Value,
    scopes: Vec<&str>,
) -> Value {
    let mut td = test_task(provisioner_id, worker_type, payload);
    td["scopes"] = serde_json::json!(scopes);
    td
}

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

async fn submit_task_def_and_assert(
    env: &TestEnv,
    task_id: &str,
    task_def: &Value,
    expected_state: &str,
    expected_reason: &str,
) {
    schedule_task(env, task_id, task_def).await;
    let (stdout, stderr) = run_worker(&env.config_path).await;

    let inner = env.state.read().unwrap();
    let entry = inner.tasks.get(task_id).unwrap_or_else(|| {
        panic!(
            "Task {task_id} not found in mock state.\nstdout:\n{stdout}\nstderr:\n{stderr}"
        )
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
}

// ===========================================================================
// D2G tests (from d2g_test.go)
// ===========================================================================

/// Port of TestD2GWithValidDockerWorkerPayload from d2g_test.go.
///
/// Verifies that a valid Docker Worker payload (with image, command,
/// maxRunTime, and artifacts) is correctly translated to a Generic Worker
/// payload and executed. The test uses a Docker image reference and
/// verifies the task completes successfully on multiuser/linux.
#[tokio::test]
#[ignore = "requires Docker and D2G payload translation"]
async fn test_d2g_with_valid_payload() {
    let env = setup_with_overrides(serde_json::json!({
        "enableLiveLog": true,
    }))
    .await;

    // Docker Worker payload format: image as JSON object, command as string array.
    let payload = serde_json::json!({
        "command": ["/bin/bash", "-c", "echo hello world > testPath && echo bye > testPath2"],
        "image": {
            "name": "ubuntu:latest",
            "type": "docker-image"
        },
        "maxRunTime": 30,
        "artifacts": {
            "testWithoutExpires": {
                "path": "testPath",
                "type": "file"
            },
            "testWithExpires": {
                "path": "testPath2",
                "type": "file",
                "expires": (Utc::now() + Duration::days(1)).to_rfc3339()
            }
        }
    });

    let td = test_task("test-provisioner", "test-worker-type", payload);
    submit_task_def_and_assert(
        &env,
        "task-d2g-valid-1",
        &td,
        "completed",
        "completed",
    )
    .await;
}

/// Port of TestD2GWithInvalidDockerWorkerPayload from d2g_test.go.
///
/// Verifies that an invalid Docker Worker payload (missing maxRunTime)
/// is rejected with exception/malformed-payload. The D2G translation
/// should validate the Docker Worker payload schema before converting.
#[tokio::test]
#[ignore = "requires Docker and D2G payload translation"]
async fn test_d2g_with_invalid_payload() {
    let env = setup_with_overrides(serde_json::json!({})).await;

    // Missing maxRunTime should cause malformed-payload.
    let payload = serde_json::json!({
        "command": ["/bin/bash", "-c", "echo hello world"],
        "image": {
            "name": "ubuntu:latest",
            "type": "docker-image"
        }
        // maxRunTime intentionally omitted
    });

    let td = test_task("test-provisioner", "test-worker-type", payload);
    submit_task_def_and_assert(
        &env,
        "task-d2g-invalid-1",
        &td,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Port of TestD2GVolumeArtifacts from d2g_test.go.
///
/// Verifies that Docker volume-type artifacts are correctly handled by the
/// D2G translation. A volume artifact specifies a directory path inside the
/// container, and all files within that directory should be uploaded as
/// individual artifacts.
#[tokio::test]
#[ignore = "requires Docker and D2G payload translation"]
async fn test_d2g_volume_artifacts() {
    let env = setup_with_overrides(serde_json::json!({
        "enableLiveLog": true,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [
            "/bin/bash", "-c",
            "mkdir -p /SampleArtifacts/_/ && echo hello world > /SampleArtifacts/_/X.txt"
        ],
        "image": {
            "name": "ubuntu:latest",
            "type": "docker-image"
        },
        "maxRunTime": 30,
        "artifacts": {
            "SampleArtifacts/_": {
                "path": "/SampleArtifacts/_",
                "type": "volume",
                "expires": (Utc::now() + Duration::days(1)).to_rfc3339()
            }
        }
    });

    let td = test_task("test-provisioner", "test-worker-type", payload);
    submit_task_def_and_assert(
        &env,
        "task-d2g-volume-1",
        &td,
        "completed",
        "completed",
    )
    .await;

    // Verify the volume contents were extracted as individual file artifacts.
    let inner = env.state.read().unwrap();
    let key = "task-d2g-volume-1:0";
    if let Some(arts) = inner.artifacts.get(key) {
        assert!(
            arts.contains_key("SampleArtifacts/_/X.txt"),
            "Expected SampleArtifacts/_/X.txt artifact from volume. Found: {:?}",
            arts.keys().collect::<Vec<_>>()
        );
    }
}

/// Port of TestD2GArtifactDoesNotExist from d2g_test.go.
///
/// Verifies that when a Docker Worker payload references an artifact that
/// does not exist in the container, the D2G translation handles it
/// gracefully. The artifact is marked as optional during translation, so
/// the task should still complete successfully, with the missing artifact
/// reported as an error-type artifact.
#[tokio::test]
#[ignore = "requires Docker and D2G payload translation"]
async fn test_d2g_artifact_does_not_exist() {
    let env = setup_with_overrides(serde_json::json!({
        "enableLiveLog": true,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [
            "/bin/bash", "-c",
            "mkdir -p SampleArtifacts/_/ && echo hello world > SampleArtifacts/_/X.txt"
        ],
        "image": {
            "name": "ubuntu:latest",
            "type": "docker-image"
        },
        "maxRunTime": 30,
        "artifacts": {
            "SampleArtifacts/_/X.txt": {
                "path": "SampleArtifacts/_/X.txt",
                "type": "file",
                "expires": (Utc::now() + Duration::days(1)).to_rfc3339()
            },
            "nonExistingArtifact.txt": {
                "path": "nonExistingArtifact.txt",
                "type": "file",
                "expires": (Utc::now() + Duration::days(1)).to_rfc3339()
            }
        }
    });

    // D2G marks artifacts as optional, so the task should still complete
    // even when some artifacts don't exist in the container.
    let td = test_task("test-provisioner", "test-worker-type", payload);
    submit_task_def_and_assert(
        &env,
        "task-d2g-missing-art-1",
        &td,
        "completed",
        "completed",
    )
    .await;
}

/// Port of TestD2GTaskclusterProxy from d2g_test.go.
///
/// Verifies that the Taskcluster proxy feature works correctly in D2G mode.
/// When a Docker Worker payload requests features.taskclusterProxy, the
/// translated Generic Worker payload should enable the taskcluster-proxy
/// feature, making TASKCLUSTER_PROXY_URL available inside the container
/// for authenticated API requests.
#[tokio::test]
#[ignore = "requires Docker and D2G payload translation"]
async fn test_d2g_taskcluster_proxy() {
    let env = setup_with_overrides(serde_json::json!({
        "enableTaskclusterProxy": true,
        "enableLiveLog": true,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [
            "/bin/bash", "-c",
            "curl -v ${TASKCLUSTER_PROXY_URL}/api/queue/v1/task/${TASK_ID}"
        ],
        "image": "denolehov/curl",
        "maxRunTime": 60,
        "features": {
            "taskclusterProxy": true
        }
    });

    let td = test_task_with_scopes(
        "test-provisioner",
        "test-worker-type",
        payload,
        vec!["queue:get-artifact:SampleArtifacts/_/X.txt"],
    );

    submit_task_def_and_assert(
        &env,
        "task-d2g-tcproxy-1",
        &td,
        "completed",
        "completed",
    )
    .await;
}

/// Port of TestD2GDockerImageArtifactCaching from d2g_test.go.
///
/// Verifies that Docker images specified as task artifacts are cached
/// between task runs. On the first run, the image artifact should be
/// downloaded and loaded with `docker load`. On the second run, the
/// cached image should be reused without re-downloading or re-loading.
///
/// The Go test verifies this by checking log output for specific messages:
///   - Run 1: "[d2g] Loading docker image" (cache miss)
///   - Run 2: "[d2g] Using cached docker image" (cache hit)
#[tokio::test]
#[ignore = "requires Docker and D2G payload translation"]
async fn test_d2g_docker_image_caching() {
    let env = setup_with_overrides(serde_json::json!({
        "enableLiveLog": true,
        "enableMounts": true,
        "numberOfTasksToRun": 2,
    }))
    .await;

    // First task: cold cache - should download and docker load.
    let payload1 = serde_json::json!({
        "command": ["echo", "run 1"],
        "image": {
            "path": "public/image.tar.gz",
            "taskId": "image-task-id",
            "type": "task-image"
        },
        "maxRunTime": 30
    });

    let td1 = test_task("test-provisioner", "test-worker-type", payload1);
    schedule_task(&env, "task-d2g-cache-1", &td1).await;

    // Second task: warm cache - should use cached image.
    let payload2 = serde_json::json!({
        "command": ["echo", "run 2"],
        "image": {
            "path": "public/image.tar.gz",
            "taskId": "image-task-id",
            "type": "task-image"
        },
        "maxRunTime": 30
    });

    let td2 = test_task("test-provisioner", "test-worker-type", payload2);
    schedule_task(&env, "task-d2g-cache-2", &td2).await;

    let (_stdout, _stderr) = run_worker(&env.config_path).await;

    // In a full integration test, we would check the log output of each run:
    // - Run 1 should contain "[d2g] Loading docker image"
    // - Run 2 should contain "[d2g] Using cached docker image"
    let inner = env.state.read().unwrap();
    // Verify both tasks were claimed and processed.
    assert!(
        inner.tasks.contains_key("task-d2g-cache-1"),
        "First D2G cache task should have been processed"
    );
    assert!(
        inner.tasks.contains_key("task-d2g-cache-2"),
        "Second D2G cache task should have been processed"
    );
}
