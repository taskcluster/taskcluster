//! RunAsCurrentUser feature - resets task credentials so that the task
//! commands run as the worker process user rather than a dedicated task user.
//!
//! This is useful for tasks that need access to resources owned by the worker
//! process (e.g. Docker socket), or when the multiuser engine is active but a
//! specific task should not be isolated into its own user account.
//!
//! Required scope: `generic-worker:run-task-as-current-user:{provisionerId}/{workerType}`

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct RunAsCurrentUserFeature {
    provisioner_id: String,
    worker_type: String,
}

impl RunAsCurrentUserFeature {
    pub fn new() -> Self {
        Self {
            provisioner_id: String::new(),
            worker_type: String::new(),
        }
    }
}

impl Feature for RunAsCurrentUserFeature {
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()> {
        self.provisioner_id = config.provisioner_id.clone();
        self.worker_type = config.worker_type.clone();
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_run_as_current_user
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.run_as_current_user
    }

    fn new_task_feature(&self, _task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(RunAsCurrentUserTaskFeature {
            provisioner_id: self.provisioner_id.clone(),
            worker_type: self.worker_type.clone(),
        })
    }

    fn rejects_when_disabled(&self) -> bool {
        true
    }

    fn name(&self) -> &'static str {
        "RunAsCurrentUser"
    }
}

struct RunAsCurrentUserTaskFeature {
    provisioner_id: String,
    worker_type: String,
}

impl TaskFeature for RunAsCurrentUserTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        vec![vec![format!(
            "generic-worker:run-task-as-current-user:{}/{}",
            self.provisioner_id, self.worker_type
        )]]
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        // When this feature is active the task commands will run as the worker
        // process user (uid/gid of the current process). The actual platform
        // data reset happens in the worker loop when it detects this feature
        // is enabled -- here we just set up environment variables.

        // On Linux, remove XDG_RUNTIME_DIR so the task does not inherit the
        // worker's XDG session directory (which may point to a directory owned
        // by a different user).
        #[cfg(target_os = "linux")]
        {
            std::env::remove_var("XDG_RUNTIME_DIR");
        }

        // Set TASK_USER_CREDENTIALS to an empty value to signal that the task
        // is running as the current (worker) user, not a dedicated task user.
        std::env::set_var("TASK_USER_CREDENTIALS", "");

        tracing::info!("RunAsCurrentUser: task will execute as the worker process user");
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // Remove the env var we set during start.
        std::env::remove_var("TASK_USER_CREDENTIALS");
    }
}
