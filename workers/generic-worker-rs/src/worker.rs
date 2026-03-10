//! Main worker loop - claims tasks, executes them, and reports results.

use anyhow::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::artifacts;
use crate::config::{self, Config};
use crate::errors::{
    CommandExecutionError, ExecutionErrors, TaskStatus, TaskUpdateReason, WorkerExitCode,
};
use crate::features;
use crate::graceful;
use crate::host;
use crate::model::*;
use crate::process;
use crate::resolvetask;
use crate::tc::{HttpQueue, Queue};
use crate::workerproto;

/// A task run context containing all state for executing a single task.
pub struct TaskRun {
    pub task_id: String,
    pub run_id: u32,
    pub task_group_id: String,
    pub definition: TaskDefinitionResponse,
    pub payload: GenericWorkerPayload,
    pub task_dir: PathBuf,
    pub root_url: String,
    pub feature_artifacts: HashMap<String, String>,
    pub local_claim_time: Instant,
    last_exit_code: i32,
}

impl TaskRun {
    /// Create a new TaskRun from a claim response.
    fn from_claim(claim: &TaskClaimResponse, config: &Config) -> Result<Self> {
        let task_id = claim.status.task_id.clone();
        let run_id = claim.run_id;
        let task_dir = PathBuf::from(&config.tasks_dir)
            .join(&task_id)
            .join(run_id.to_string());

        // Parse the payload
        let payload: GenericWorkerPayload =
            serde_json::from_value(claim.task.payload.clone()).unwrap_or_default();

        // Create the task directory
        std::fs::create_dir_all(&task_dir)?;

        Ok(Self {
            task_id,
            run_id,
            task_group_id: claim.task.task_group_id.clone(),
            definition: claim.task.clone(),
            payload,
            task_dir,
            root_url: config.root_url.clone(),
            feature_artifacts: HashMap::new(),
            local_claim_time: Instant::now(),
            last_exit_code: 0,
        })
    }

    /// Execute all commands in the task payload.
    async fn execute_commands(&mut self, config: &Config) -> Option<CommandExecutionError> {
        let max_run_time = Duration::from_secs(self.payload.max_run_time.max(0) as u64);
        let deadline = tokio::time::Instant::now() + max_run_time;

        // Register the global abort sender so that graceful termination
        // can kill running commands.
        let (abort_tx, _abort_rx) = graceful::register_abort_sender();
        let _abort_guard = scopeguard::guard((), |_| {
            graceful::deregister_abort_sender();
        });

        for (i, cmd_line) in self.payload.command.iter().enumerate() {
            tracing::info!(
                "[task {}/{}] Executing command {}: {:?}",
                self.task_id,
                self.run_id,
                i,
                cmd_line
            );

            // Build environment
            let mut env: HashMap<String, String> = std::env::vars().collect();
            for (k, v) in &self.payload.env {
                env.insert(k.clone(), v.clone());
            }
            // Add Taskcluster standard env vars
            env.insert("TASK_ID".to_string(), self.task_id.clone());
            env.insert("RUN_ID".to_string(), self.run_id.to_string());
            env.insert("TASKCLUSTER_ROOT_URL".to_string(), self.root_url.clone());
            env.insert("TASK_GROUP_ID".to_string(), self.task_group_id.clone());

            // Create platform data
            let platform_data = process::PlatformData::default();

            // Create command
            let env_vec: Vec<(String, String)> = env.into_iter().collect();
            let mut command =
                process::CommandBuilder::new(cmd_line, &self.task_dir.display().to_string())
                    .env(env_vec)
                    .platform_data(platform_data)
                    .build();

            // Wire the global abort sender to this command so SIGTERM kills it.
            command.set_abort_sender(abort_tx.clone());

            // Execute the command with max run time enforcement
            let remaining = deadline.duration_since(tokio::time::Instant::now());
            let result = match tokio::time::timeout(remaining, command.execute(None)).await {
                Ok(result) => result,
                Err(_) => {
                    tracing::error!(
                        "[task {}/{}] Command {} timed out after {}s (max run time exceeded)",
                        self.task_id,
                        self.run_id,
                        i,
                        max_run_time.as_secs()
                    );
                    return Some(CommandExecutionError::new(
                        TaskStatus::Failed,
                        anyhow::anyhow!("task aborted - max run time exceeded"),
                        TaskUpdateReason::InternalError,
                    ));
                }
            };

            tracing::info!(
                "[task {}/{}] Command {} {}: {}",
                self.task_id,
                self.run_id,
                i,
                result.verdict(),
                result
            );

            self.last_exit_code = result.exit_code;

            if result.aborted {
                return Some(CommandExecutionError::new(
                    TaskStatus::Aborted,
                    anyhow::anyhow!("command {} was aborted", i),
                    TaskUpdateReason::WorkerShutdown,
                ));
            }

            if result.failed() {
                if let Some(cause) = result.failure_cause() {
                    return Some(CommandExecutionError::new(
                        TaskStatus::Failed,
                        anyhow::anyhow!("command {} failed: {}", i, cause),
                        TaskUpdateReason::InternalError,
                    ));
                }
            }
        }

        None
    }
}

const TASKS_RESOLVED_COUNT_FILE: &str = "tasks-resolved-count.txt";

/// Read the tasks-resolved count from the file in the current working directory.
/// Returns 0 if the file does not exist or cannot be parsed.
fn read_tasks_resolved_file() -> u64 {
    let path = Path::new(TASKS_RESOLVED_COUNT_FILE);
    match std::fs::read_to_string(path) {
        Ok(content) => match content.trim().parse::<u64>() {
            Ok(n) => n,
            Err(e) => {
                tracing::warn!(
                    "Could not parse content of {:?}: {} (ignored)",
                    path,
                    e
                );
                0
            }
        },
        Err(e) => {
            tracing::info!(
                "Could not open {:?}: {} (ignored)",
                path,
                e
            );
            0
        }
    }
}

/// Write the tasks-resolved count to the file in the current working directory.
fn write_tasks_resolved_file(count: u64) -> Result<()> {
    let path = Path::new(TASKS_RESOLVED_COUNT_FILE);
    std::fs::write(path, count.to_string())?;
    Ok(())
}

/// Main worker entry point.
pub async fn run_worker(config_path: &str, with_worker_runner: bool) -> Result<WorkerExitCode> {
    tracing::info!("Generic Worker (Rust) starting up");

    // Load configuration
    let mut config = config::load_config(config_path)?;

    // Optionally configure from worker-runner
    if with_worker_runner {
        configure_from_worker_runner(&mut config)?;
    }

    // Validate configuration
    config.validate()?;

    tracing::info!(
        "Worker {}/{} ({}) starting, root URL: {}",
        config.provisioner_id,
        config.worker_type,
        config.worker_id,
        config.root_url
    );

    // Install signal handlers for graceful termination
    graceful::install_signal_handlers();

    // Initialize features
    let feature_list = features::initialise_features(&config)?;

    // Create Queue client
    let queue = HttpQueue::new(config.root_url.clone(), config.credentials());

    // Read the persisted tasks-resolved count (survives worker restarts)
    let mut tasks_resolved = read_tasks_resolved_file();
    tracing::info!(
        "Tasks resolved count file: {:?} (current count: {})",
        TASKS_RESOLVED_COUNT_FILE,
        tasks_resolved
    );

    // Main worker loop
    let idle_timeout = Duration::from_secs(config.idle_timeout_secs);
    let mut last_claim_time = Instant::now();

    loop {
        // Check for graceful termination
        if graceful::termination_requested() {
            tracing::info!("Graceful termination requested, shutting down");
            write_tasks_resolved_file(tasks_resolved)?;
            return Ok(WorkerExitCode::WorkerShutdown);
        }

        // Check if we've completed enough tasks
        if config.number_of_tasks_to_run > 0 && tasks_resolved >= config.number_of_tasks_to_run {
            tracing::info!(
                "Completed {} tasks (limit: {}), shutting down",
                tasks_resolved,
                config.number_of_tasks_to_run
            );
            write_tasks_resolved_file(tasks_resolved)?;
            return Ok(WorkerExitCode::TasksComplete);
        }

        // Claim work
        let claim_response = claim_work(&queue, &config).await;

        match claim_response {
            Ok(Some(claim)) => {
                last_claim_time = Instant::now();

                // Process the claimed task
                let _exit_code =
                    process_task(&claim, &config, &feature_list, &queue).await?;
                tasks_resolved += 1;
                write_tasks_resolved_file(tasks_resolved)?;

                let remaining_tasks =
                    config.number_of_tasks_to_run as i64 - tasks_resolved as i64;
                let remaining_text = if remaining_tasks > 0 {
                    format!(
                        " (will exit after resolving {} more)",
                        remaining_tasks
                    )
                } else {
                    String::new()
                };
                tracing::info!(
                    "Resolved {} tasks in total so far{}.",
                    tasks_resolved,
                    remaining_text
                );
            }
            Ok(None) => {
                // No work available
                if config.shutdown_machine_on_idle && last_claim_time.elapsed() >= idle_timeout {
                    tracing::info!(
                        "Idle timeout ({:?}) reached, shutting down",
                        idle_timeout
                    );
                    write_tasks_resolved_file(tasks_resolved)?;
                    host::immediate_shutdown("idle timeout");
                    return Ok(WorkerExitCode::IdleTimeout);
                }

                // Poll interval
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
            Err(e) => {
                tracing::warn!("Failed to claim work: {e}");
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        }
    }
}

/// Claim a task from the Queue.
async fn claim_work(queue: &HttpQueue, config: &Config) -> Result<Option<TaskClaimResponse>> {
    let request = ClaimWorkRequest {
        tasks_claimed: 1,
        worker_group: config.worker_group.clone(),
        worker_id: config.worker_id.clone(),
    };

    let response = queue
        .claim_work(&config.provisioner_id, &config.worker_type, &request)
        .await?;

    if response.tasks.is_empty() {
        Ok(None)
    } else {
        Ok(Some(response.tasks.into_iter().next().unwrap()))
    }
}

/// Process a single claimed task through the full lifecycle.
async fn process_task(
    claim: &TaskClaimResponse,
    config: &Config,
    feature_list: &[Box<dyn features::Feature>],
    queue: &HttpQueue,
) -> Result<i32> {
    let task_id = &claim.status.task_id;
    let run_id = claim.run_id;

    tracing::info!("Processing task {}/{}", task_id, run_id);

    // Create TaskRun
    let mut task_run = TaskRun::from_claim(claim, config)?;

    // Start features
    let (mut task_features, start_error) =
        features::start_features(feature_list, &task_run, config);

    let mut errors = ExecutionErrors::new();

    if let Some(err) = start_error {
        tracing::error!("Feature start failed: {}", err);
        errors.add(err);
    } else {
        // Execute commands
        if let Some(err) = task_run.execute_commands(config).await {
            errors.add(err);
        }
    }

    // Stop features (reverse order)
    let stop_ctx = features::StopContext {
        last_exit_code: task_run.last_exit_code,
        purge_caches_exit_codes: task_run.payload.on_exit_status.purge_caches.clone(),
    };
    features::stop_features(&mut task_features, &mut errors, &stop_ctx);

    // Determine task resolution
    let resolution = resolvetask::resolve_task(
        task_run.last_exit_code,
        &errors,
        &task_run.payload.on_exit_status.retry,
        &task_run.payload.on_exit_status.purge_caches,
    );

    // Report task resolution
    match resolution.status {
        TaskStatus::Succeeded => {
            tracing::info!("Task {}/{} succeeded", task_id, run_id);
            if let Err(e) = queue.report_completed(task_id, run_id).await {
                tracing::error!("Failed to report task completed: {e}");
            }
        }
        TaskStatus::Failed => {
            tracing::info!("Task {}/{} failed", task_id, run_id);
            if let Err(e) = queue.report_failed(task_id, run_id).await {
                tracing::error!("Failed to report task failed: {e}");
            }
        }
        _ => {
            let reason = resolution
                .reason
                .unwrap_or(TaskUpdateReason::InternalError);
            tracing::info!("Task {}/{} exception: {}", task_id, run_id, reason);
            if let Err(e) = queue
                .report_exception(task_id, run_id, &reason.to_string())
                .await
            {
                tracing::error!("Failed to report task exception: {e}");
            }
        }
    }

    // Upload artifacts
    let discovered_artifacts = artifacts::discover_artifacts(
        &task_run.task_dir,
        &task_run.payload.artifacts,
        claim.task.expires,
    );
    for artifact in &discovered_artifacts {
        if let Err(e) = artifacts::upload_artifact(queue, task_id, run_id, artifact, config).await {
            tracing::warn!("Failed to upload artifact {}: {e}", artifact.base().name);
        }
    }

    // Clean up task directory
    if config.clean_up_task_dirs {
        if let Err(e) = std::fs::remove_dir_all(&task_run.task_dir) {
            tracing::warn!(
                "Failed to clean up task dir {}: {e}",
                task_run.task_dir.display()
            );
        }
    }

    Ok(task_run.last_exit_code)
}

/// Configure the worker from worker-runner via the protocol pipe.
fn configure_from_worker_runner(config: &mut Config) -> Result<()> {
    let mut protocol = workerproto::Protocol::from_stdio()?;
    protocol.start()?;

    tracing::info!("Connected to worker-runner via protocol pipe");

    // Read configuration message
    let msg = protocol.receive()?;
    if msg.msg_type != "new-config" {
        tracing::warn!(
            "Expected 'new-config' message from worker-runner, got '{}'",
            msg.msg_type
        );
        return Ok(());
    }

    // Merge configuration
    if let Some(worker_config) = msg.properties.get("config") {
        config::merge_configs(config, worker_config)?;
    }

    // Update credentials if provided
    if let Some(creds) = msg.properties.get("credentials") {
        if let Some(client_id) = creds.get("clientId").and_then(|v| v.as_str()) {
            config.client_id = client_id.to_string();
        }
        if let Some(access_token) = creds.get("accessToken").and_then(|v| v.as_str()) {
            config.access_token = access_token.to_string();
        }
        if let Some(certificate) = creds.get("certificate").and_then(|v| v.as_str()) {
            config.certificate = certificate.to_string();
        }
    }

    Ok(())
}
