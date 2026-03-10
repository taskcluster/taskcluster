//! Task resolution logic.
//!
//! Determines the final resolution of a task based on exit codes,
//! payload configuration, and feature results.

use crate::errors::{ExecutionErrors, TaskStatus, TaskUpdateReason};

/// Determine the final task resolution based on execution results.
pub struct TaskResolution {
    pub status: TaskStatus,
    pub reason: Option<TaskUpdateReason>,
}

/// Resolve a task based on its execution results.
pub fn resolve_task(
    exit_code: i32,
    errors: &ExecutionErrors,
    retry_exit_codes: &[i64],
    purge_cache_exit_codes: &[i64],
) -> TaskResolution {
    // Check for worker shutdown
    if errors.worker_shutdown() {
        return TaskResolution {
            status: TaskStatus::Errored,
            reason: Some(TaskUpdateReason::WorkerShutdown),
        };
    }

    // Check for system-level errors (errors that are NOT simple command failures
    // with a non-zero exit code). If we have errors, check whether the exit code
    // matches a retry code first, since retry takes priority over failure.
    if errors.occurred() {
        // If the exit code matches a retry code, return intermittent-task
        // regardless of errors (the task author explicitly wants retries for
        // this exit code).
        if exit_code != 0 && retry_exit_codes.contains(&(exit_code as i64)) {
            return TaskResolution {
                status: TaskStatus::Errored,
                reason: Some(TaskUpdateReason::IntermittentTask),
            };
        }

        // Use the first error's status/reason
        for err in errors.iter() {
            return TaskResolution {
                status: err.task_status,
                reason: Some(err.reason),
            };
        }
    }

    // Check retry exit codes (no errors case)
    if retry_exit_codes.contains(&(exit_code as i64)) {
        return TaskResolution {
            status: TaskStatus::Errored,
            reason: Some(TaskUpdateReason::IntermittentTask),
        };
    }

    // Determine success or failure based on exit code
    if exit_code == 0 {
        TaskResolution {
            status: TaskStatus::Succeeded,
            reason: None,
        }
    } else {
        TaskResolution {
            status: TaskStatus::Failed,
            reason: None,
        }
    }
}

/// Check if caches should be purged based on exit code.
pub fn should_purge_caches(exit_code: i32, purge_exit_codes: &[i64]) -> bool {
    purge_exit_codes.contains(&(exit_code as i64))
}
