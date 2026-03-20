//! Backing log feature - creates and manages the task log file.

use std::fs::File;
use std::io::Write;
use std::path::PathBuf;

use crate::config::Config;
use crate::errors::{internal_error, CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

const LOG_PATH: &str = "live_backing.log";

pub struct BackingLogFeature;

impl BackingLogFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for BackingLogFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, _config: &Config) -> bool {
        true
    }

    fn is_requested(&self, _task: &TaskRun) -> bool {
        true
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(BackingLogTaskFeature {
            task_dir: task.task_dir.clone(),
            log_path: task.task_dir.join(LOG_PATH),
            log_handle: None,
            backing_log_enabled: task.payload.features.backing_log,
            backing_log_name: task.payload.logs.backing.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "BackingLog"
    }
}

struct BackingLogTaskFeature {
    task_dir: PathBuf,
    log_path: PathBuf,
    log_handle: Option<File>,
    backing_log_enabled: bool,
    backing_log_name: String,
}

impl TaskFeature for BackingLogTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Create the log file
        match File::create(&self.log_path) {
            Ok(handle) => {
                self.log_handle = Some(handle);
                None
            }
            Err(e) => Some(internal_error(
                anyhow::anyhow!("failed to create log file {}: {}", self.log_path.display(), e),
            )),
        }
    }

    fn stop(&mut self, errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // Close the log handle
        if let Some(mut handle) = self.log_handle.take() {
            if errors.occurred() {
                let _ = writeln!(handle, "{}", errors);
            }
            // File is closed on drop
        }

        // TODO: Upload backing log artifact if enabled
    }
}
