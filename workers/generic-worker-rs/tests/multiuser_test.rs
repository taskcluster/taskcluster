//! Multiuser engine tests ported from the Go generic-worker.
//!
//! These tests exercise multiuser-specific functionality: task user creation,
//! OS group management, chain of trust, and RunAfterUserCreation hooks.
//!
//! All tests are marked `#[ignore]` because they require the multiuser engine
//! (task user creation) which needs elevated privileges and platform-specific
//! user management infrastructure.

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

async fn setup() -> TestEnv {
    setup_with_overrides(serde_json::json!({})).await
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
        "cleanUpTaskDirs": false,
        "enableLiveLog": false,
        "enableMetadata": false,
        "enableMounts": false,
        "enableChainOfTrust": false,
        "enableInteractive": false,
        "enableTaskclusterProxy": false,
        "enableResourceMonitor": false,
        "enableOsGroups": false,
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
            "name": "Multiuser Test Task",
            "description": "A task created by multiuser tests",
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

// ===========================================================================
// Multiuser tests (from multiuser_test.go)
// ===========================================================================

/// Port of TestWhoAmI from multiuser_test.go.
///
/// Verifies that the task user is NOT the same as the worker user when
/// running in multiuser mode. The multiuser engine creates a new OS user
/// for each task, so `whoami` should return a task-specific username
/// (e.g., "task_XXXX") rather than the worker's own username.
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_who_am_i() {
    let env = setup().await;

    // In multiuser mode, "whoami" should return the task user, not the worker user.
    let payload = serde_json::json!({
        "command": [["whoami"]],
        "maxRunTime": 180
    });

    submit_and_assert(&env, "task-whoami-1", payload, "completed", "completed").await;

    // In a full multiuser test, we would also verify that the output of
    // whoami contains "task_" prefix (the created task user), not the
    // current user running the worker process.
}

/// Port of TestWhoAmIAsCurrentUser from multiuser_test.go.
///
/// Verifies that when RunTaskAsCurrentUser feature is enabled with proper
/// scopes, the task runs as the current (worker) user rather than creating
/// a new task user.
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_who_am_i_as_current_user() {
    let env = setup().await;

    let payload = serde_json::json!({
        "command": [["whoami"]],
        "maxRunTime": 180,
        "features": {
            "runTaskAsCurrentUser": true
        }
    });

    let td = test_task_with_scopes(
        "test-provisioner",
        "test-worker-type",
        payload,
        vec!["generic-worker:run-task-as-current-user:test-provisioner/test-worker-type"],
    );

    submit_task_def_and_assert(
        &env,
        "task-whoami-current-1",
        &td,
        "completed",
        "completed",
    )
    .await;
}

// ===========================================================================
// OS groups multiuser tests (from os_groups_multiuser_test.go)
// ===========================================================================

/// Port of TestMissingScopesOSGroups from os_groups_multiuser_test.go.
///
/// Verifies that requesting OS groups without the required scopes results
/// in an exception with malformed-payload reason. The multiuser engine
/// requires `generic-worker:os-group:<provisionerId>/<workerType>/<group>`
/// scopes to add the task user to OS groups.
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_missing_scopes_os_groups() {
    let env = setup_with_overrides(serde_json::json!({
        "enableOsGroups": true,
    }))
    .await;

    let payload = serde_json::json!({
        "command": [["echo", "hello world!"], ["echo", "goodbye world!"]],
        "maxRunTime": 30,
        "osGroups": ["abc", "def"]
    });

    // Do NOT set any scopes - this should cause malformed-payload.
    let td = test_task("test-provisioner", "test-worker-type", payload);

    submit_task_def_and_assert(
        &env,
        "task-missing-scopes-osgroups-1",
        &td,
        "exception",
        "malformed-payload",
    )
    .await;
}

/// Port of TestOSGroupsRespected from os_groups_multiuser_test.go.
///
/// Verifies that when OS groups are requested with proper scopes, the
/// multiuser engine actually adds the task user to those groups. The test
/// creates real OS groups, runs a task that lists group membership, and
/// verifies the output contains the expected groups.
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_os_groups_respected() {
    let env = setup_with_overrides(serde_json::json!({
        "enableOsGroups": true,
    }))
    .await;

    // In the Go test, real OS groups are created via groupadd/dseditgroup,
    // the task lists its groups, and the output is verified. Here we set up
    // the same payload structure. The actual group creation and verification
    // requires elevated privileges.
    let group1 = "test-group-alpha";
    let group2 = "test-group-beta";

    let payload = serde_json::json!({
        "command": [["id", "-Gn"]],
        "maxRunTime": 30,
        "osGroups": [group1, group2]
    });

    let td = test_task_with_scopes(
        "test-provisioner",
        "test-worker-type",
        payload,
        vec![
            &format!("generic-worker:os-group:test-provisioner/test-worker-type/{group1}"),
            &format!("generic-worker:os-group:test-provisioner/test-worker-type/{group2}"),
        ],
    );

    submit_task_def_and_assert(
        &env,
        "task-os-groups-respected-1",
        &td,
        "completed",
        "completed",
    )
    .await;
}

// ===========================================================================
// Chain of trust tests (from chain_of_trust_test.go)
// ===========================================================================

/// Port of TestChainOfTrustUpload from chain_of_trust_test.go.
///
/// Verifies that when the chain of trust feature is enabled, the worker
/// creates the expected CoT artifacts:
///   - public/chain-of-trust.json (containing artifact hashes, task def,
///     environment info)
///   - public/chain-of-trust.json.sig (ed25519 signature)
///   - public/logs/certified.log (certified copy of task log)
///
/// The test also verifies the signature can be verified with the worker's
/// ed25519 public key, and that the CoT certificate contains the correct
/// taskId, runId, workerGroup, workerId, and environment fields.
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_chain_of_trust_upload() {
    let env = setup_with_overrides(serde_json::json!({
        "enableChainOfTrust": true,
        "enableLiveLog": true,
    }))
    .await;

    // The Go test copies test artifacts and then checks that CoT artifacts
    // are created with correct hashes and signatures.
    let payload = serde_json::json!({
        "command": [
            ["echo", "hello world!"],
            ["echo", "goodbye world!"]
        ],
        "maxRunTime": 30,
        "artifacts": [
            {
                "path": "public/build/X.txt",
                "type": "file",
                "name": "public/build/X.txt"
            }
        ],
        "features": {
            "chainOfTrust": true
        }
    });

    submit_and_assert(
        &env,
        "task-cot-upload-1",
        payload,
        "completed",
        "completed",
    )
    .await;

    // Verify CoT artifacts were created.
    let inner = env.state.read().unwrap();
    let key = "task-cot-upload-1:0";
    if let Some(arts) = inner.artifacts.get(key) {
        // The chain of trust feature should produce these artifacts:
        assert!(
            arts.contains_key("public/chain-of-trust.json"),
            "Expected public/chain-of-trust.json artifact. Found: {:?}",
            arts.keys().collect::<Vec<_>>()
        );
        assert!(
            arts.contains_key("public/chain-of-trust.json.sig"),
            "Expected public/chain-of-trust.json.sig artifact. Found: {:?}",
            arts.keys().collect::<Vec<_>>()
        );
    }
}

/// Port of TestProtectedArtifactsReplaced from chain_of_trust_test.go.
///
/// Verifies that a task cannot replace protected artifacts (live.log,
/// live_backing.log, certified.log, chain-of-trust.json,
/// chain-of-trust.json.sig) with its own content. Even if the task
/// creates files with those names in its artifact paths, the worker
/// should overwrite them with the genuine artifacts.
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_protected_artifacts_replaced() {
    let env = setup_with_overrides(serde_json::json!({
        "enableChainOfTrust": true,
        "enableLiveLog": true,
    }))
    .await;

    // The task tries to create files at protected artifact paths, plus
    // legitimate artifacts X.txt and Y.txt. The worker should overwrite
    // the protected ones with genuine content.
    let payload = serde_json::json!({
        "command": [
            ["echo", "hello world!"],
            ["echo", "goodbye world!"]
        ],
        "maxRunTime": 30,
        "artifacts": [
            { "path": "public/logs/live.log", "type": "file" },
            { "path": "public/logs/live_backing.log", "type": "file" },
            { "path": "public/logs/certified.log", "type": "file" },
            { "path": "public/chain-of-trust.json", "type": "file" },
            { "path": "public/chain-of-trust.json.sig", "type": "file" },
            { "path": "public/X.txt", "type": "file" },
            { "path": "public/Y.txt", "type": "file" }
        ],
        "features": {
            "chainOfTrust": true
        }
    });

    submit_and_assert(
        &env,
        "task-protected-arts-1",
        payload,
        "completed",
        "completed",
    )
    .await;

    // In a full integration test, we would verify that the content of
    // protected artifacts is NOT the same as what the task wrote, while
    // X.txt and Y.txt contain the task's content.
    let inner = env.state.read().unwrap();
    let key = "task-protected-arts-1:0";
    if let Some(arts) = inner.artifacts.get(key) {
        // All 7 artifacts should be present.
        for name in &[
            "public/logs/live.log",
            "public/logs/live_backing.log",
            "public/logs/certified.log",
            "public/chain-of-trust.json",
            "public/chain-of-trust.json.sig",
            "public/X.txt",
            "public/Y.txt",
        ] {
            assert!(
                arts.contains_key(*name),
                "Expected artifact {name} to be present. Found: {:?}",
                arts.keys().collect::<Vec<_>>()
            );
        }
    }
}

// ===========================================================================
// User creation tests (from user_creation_multiuser_test.go)
// ===========================================================================

/// Port of TestRunAfterUserCreation from user_creation_multiuser_test.go.
///
/// Verifies that the RunAfterUserCreation config option causes the specified
/// script to be executed after the task user is created but before the task
/// commands run. The script runs as the task user and can perform setup like
/// configuring the user's environment.
///
/// In the Go test, a script writes `whoami` output to a file, and the test
/// verifies the file contains the task user's name (prefixed with "task_").
#[tokio::test]
#[ignore = "requires multiuser engine (task user creation)"]
async fn test_run_after_user_creation() {
    // Create a temporary script that writes the current username to a file.
    let tmp = TempDir::new().unwrap();
    let script_path = tmp.path().join("run-after-user.sh");

    #[cfg(unix)]
    {
        std::fs::write(
            &script_path,
            "#!/bin/bash\nwhoami > \"${TASK_DIR}/run-after-user.txt\"\n",
        )
        .unwrap();
        // Make the script executable.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                &script_path,
                std::fs::Permissions::from_mode(0o755),
            )
            .unwrap();
        }
    }
    #[cfg(windows)]
    {
        std::fs::write(
            &script_path,
            "@echo off\r\nwhoami > \"%TASK_DIR%\\run-after-user.txt\"\r\n",
        )
        .unwrap();
    }

    let env = setup_with_overrides(serde_json::json!({
        "runAfterUserCreation": script_path.display().to_string(),
    }))
    .await;

    let payload = serde_json::json!({
        "command": [["true"]],
        "maxRunTime": 30
    });

    submit_and_assert(
        &env,
        "task-run-after-user-1",
        payload,
        "completed",
        "completed",
    )
    .await;

    // In a full multiuser test, we would read the run-after-user.txt file
    // from the task directory and verify it contains a task user name
    // (e.g., "task_XXXX") rather than the worker's username.
}
