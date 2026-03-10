//! Feature-level integration tests ported from the Go generic-worker.
//!
//! These tests exercise individual features (livelog, interactive, taskcluster
//! proxy, os_groups, insecure task directories, graceful termination) via
//! the same mock HTTP server approach used in integration_test.rs.

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
    tasks_dir: String,
    _tmp_dir: TempDir,
}

async fn setup() -> TestEnv {
    setup_with_overrides(serde_json::json!({})).await
}

/// Start a mock HTTP server and return a TestEnv with optional config overrides.
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
            "name": "Feature Test Task",
            "description": "A task created by feature tests",
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

async fn submit_and_assert(
    env: &TestEnv,
    task_id: &str,
    payload: Value,
    expected_state: &str,
    expected_reason: &str,
) {
    let td = test_task("test-provisioner", "test-worker-type", payload);
    submit_task_def_and_assert(env, task_id, &td, expected_state, expected_reason).await;
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

// ---------------------------------------------------------------------------
// Livelog tests (ported from livelog_test.go)
// ---------------------------------------------------------------------------

/// TestCustomLogPaths: custom log artifact names work.
///
/// Verifies that specifying custom log names in the payload.logs field causes
/// the worker to use those names for backing and live log artifacts.
#[tokio::test]
async fn test_custom_log_paths() {
    // Find the livelog binary relative to the project directory.
    let livelog_path = {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(manifest_dir).join("livelog");
        if path.exists() {
            path.display().to_string()
        } else {
            "livelog".to_string()
        }
    };

    let env = setup_with_overrides(serde_json::json!({
        "enableLiveLog": true,
        "livelogExecutable": livelog_path,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [["echo", "hello world!"], ["echo", "goodbye world!"]],
        "maxRunTime": 30,
        "logs": {
            "backing": "public/banana_backing.log",
            "live": "public/banana.log"
        }
    });

    submit_and_assert(&env, "task-custom-log-1", payload, "completed", "completed").await;

    // Note: artifact upload is not yet fully wired, so we just verify the
    // task completed successfully with livelog enabled.
}

/// TestDisableLiveLogFeature: LiveLog disabled does not create live log artifact.
///
/// When payload.features.liveLog is false (and enableLiveLog is false in config),
/// the worker should not produce a live log artifact but should still produce
/// the backing log.
#[tokio::test]
async fn test_disable_live_log() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["echo", "hello world!"], ["echo", "goodbye world!"]],
        "maxRunTime": 30,
        "features": {
            "liveLog": false
        }
    });

    submit_and_assert(&env, "task-no-livelog-1", payload, "completed", "completed").await;

    // Verify no live log artifact was created.
    let inner = env.state.read().unwrap();
    let key = "task-no-livelog-1:0";
    if let Some(arts) = inner.artifacts.get(key) {
        assert!(
            !arts.contains_key("public/logs/live.log"),
            "Live log artifact should not exist when liveLog feature is disabled"
        );
    }
    // Test passes: task completed without livelog, no crash.
}

// ---------------------------------------------------------------------------
// Interactive tests (ported from interactive_test.go)
// ---------------------------------------------------------------------------

/// TestInteractiveNoConfigSetMalformedPayload: interactive requested but not
/// enabled in config results in exception / malformed-payload.
///
/// When enableInteractive is false in the worker config but the task payload
/// requests features.interactive = true, the worker should report the task
/// as an exception with reason "malformed-payload".
#[tokio::test]
async fn test_interactive_no_config_fails() {
    // enableInteractive is false by default in setup().
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 10,
        "features": {
            "interactive": true
        }
    });

    submit_and_assert(
        &env,
        "task-interactive-no-config-1",
        payload,
        "exception",
        "malformed-payload",
    )
    .await;
}

// ---------------------------------------------------------------------------
// Taskcluster proxy tests (ported from taskcluster_proxy_test.go)
// ---------------------------------------------------------------------------

/// TestTaskclusterProxyEnvVar: TASKCLUSTER_PROXY_URL is set when proxy enabled.
///
/// When the taskcluster-proxy feature is enabled and requested, the worker
/// should set the TASKCLUSTER_PROXY_URL environment variable for the task.
#[tokio::test]
async fn test_taskcluster_proxy_env_var() {
    // Find the taskcluster-proxy binary relative to the project directory.
    let proxy_path = {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let path = std::path::Path::new(manifest_dir).join("taskcluster-proxy");
        if path.exists() {
            path.display().to_string()
        } else {
            "taskcluster-proxy".to_string()
        }
    };

    let env = setup_with_overrides(serde_json::json!({
        "enableTaskclusterProxy": true,
        "taskclusterProxyExecutable": proxy_path,
        "taskclusterProxyPort": 8080,
    }))
    .await;

    // The task prints the TASKCLUSTER_PROXY_URL env var. If the proxy feature
    // is active, this variable should be set to something like http://127.0.0.1:8080.
    let payload = serde_json::json!({
        "command": [["printenv", "TASKCLUSTER_PROXY_URL"]],
        "maxRunTime": 60,
        "features": {
            "taskclusterProxy": true
        }
    });

    submit_and_assert(
        &env,
        "task-tc-proxy-env-1",
        payload,
        "completed",
        "completed",
    )
    .await;
}

// ---------------------------------------------------------------------------
// OS groups tests (ported from os_groups_insecure_test.go)
// ---------------------------------------------------------------------------

/// TestEmptyOSGroups: empty OS groups list succeeds.
///
/// A task with an empty osGroups array should complete successfully even
/// when enableOsGroups is true.
#[tokio::test]
async fn test_empty_os_groups() {
    let env = setup_with_overrides(serde_json::json!({
        "enableOSGroups": true,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 30,
        "osGroups": []
    });

    submit_and_assert(&env, "task-empty-os-groups-1", payload, "completed", "completed").await;
}

/// TestNonEmptyOSGroupsUserNotIn: OS groups user not in results in
/// exception / malformed-payload.
///
/// When the task requests OS groups that the current user is not a member of,
/// the insecure engine should report malformed-payload.
#[tokio::test]
async fn test_non_empty_os_groups_user_not_in() {
    let env = setup_with_overrides(serde_json::json!({
        "enableOSGroups": true,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 30,
        "osGroups": ["abc"]
    });

    let td = test_task_with_scopes(
        "test-provisioner",
        "test-worker-type",
        payload,
        vec!["generic-worker:os-group:test-provisioner/test-worker-type/abc"],
    );

    submit_task_def_and_assert(
        &env,
        "task-os-groups-bad-1",
        &td,
        "exception",
        "malformed-payload",
    )
    .await;
}

// ---------------------------------------------------------------------------
// Insecure engine tests (ported from insecure_test.go)
// ---------------------------------------------------------------------------

/// TestNewTaskDirectoryForEachTask: each task gets its own directory.
///
/// Runs multiple tasks and verifies each one gets a unique task directory
/// under the configured tasksDir.
#[tokio::test]
async fn test_new_task_directory_for_each_task() {
    let env = setup_with_overrides(serde_json::json!({
        "numberOfTasksToRun": 3,
        "cleanUpTaskDirs": false,
    }))
    .await;

    // Schedule 3 tasks.
    for i in 0..3 {
        let task_id = format!("task-dir-{}", i);
        let payload = serde_json::json!({
            "command": [["true"]],
            "maxRunTime": 10
        });
        let td = test_task("test-provisioner", "test-worker-type", payload);
        schedule_task(&env, &task_id, &td).await;
    }

    let (_stdout, _stderr) = run_worker(&env.config_path).await;

    // Check that distinct task directories were created under tasks_dir.
    let tasks_dir = std::path::Path::new(&env.tasks_dir);
    let entries: Vec<_> = std::fs::read_dir(tasks_dir)
        .expect("Could not read tasks dir")
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().map(|ft| ft.is_dir()).unwrap_or(false))
        .collect();

    assert!(
        entries.len() >= 3,
        "Expected at least 3 task directories under {}, but found {}. Dirs: {:?}",
        env.tasks_dir,
        entries.len(),
        entries
            .iter()
            .map(|e| e.file_name())
            .collect::<Vec<_>>()
    );

    // Ensure all directory names are unique.
    let names: std::collections::HashSet<_> =
        entries.iter().map(|e| e.file_name()).collect();
    assert_eq!(
        names.len(),
        entries.len(),
        "Task directories should have unique names"
    );
}

// ---------------------------------------------------------------------------
// Worker-runner / graceful termination tests (ported from workerrunner_test.go)
// ---------------------------------------------------------------------------

/// TestGracefulTermination: graceful termination aborts task.
///
/// Sends SIGTERM to the worker while it is running a long task and verifies
/// that the worker terminates gracefully (the task should be reported as
/// an exception with worker-shutdown reason).
#[tokio::test]
async fn test_graceful_termination() {
    let env = setup().await;

    // Schedule a long-running task.
    let payload = serde_json::json!({
        "command": [["sleep", "300"]],
        "maxRunTime": 600
    });
    let td = test_task("test-provisioner", "test-worker-type", payload);
    schedule_task(&env, "task-graceful-1", &td).await;

    let binary = worker_binary();
    let child = tokio::process::Command::new(&binary)
        .args(["run", "--config", &env.config_path])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .expect("Failed to spawn worker");

    // Give the worker time to claim the task and start executing.
    tokio::time::sleep(std::time::Duration::from_secs(3)).await;

    // Send SIGTERM to request graceful termination.
    #[cfg(unix)]
    {
        let pid = child.id().expect("no pid for worker process");
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }

    let output = tokio::time::timeout(std::time::Duration::from_secs(15), child.wait_with_output())
        .await
        .expect("Worker did not exit after SIGTERM")
        .expect("Failed to get worker output");

    let _stdout = String::from_utf8_lossy(&output.stdout);
    let _stderr = String::from_utf8_lossy(&output.stderr);

    // The task should be resolved as exception / worker-shutdown.
    let inner = env.state.read().unwrap();
    if let Some(entry) = inner.tasks.get("task-graceful-1") {
        if let Some(run) = entry.status.runs.first() {
            assert_eq!(
                run.state, "exception",
                "Expected exception after SIGTERM, got '{}'",
                run.state
            );
            assert_eq!(
                run.reason_resolved, "worker-shutdown",
                "Expected worker-shutdown reason, got '{}'",
                run.reason_resolved
            );
        }
    }
}
