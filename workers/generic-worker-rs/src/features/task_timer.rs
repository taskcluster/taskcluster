//! Task timer feature - records task execution duration.

use std::time::Instant;

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct TaskTimerFeature;

impl TaskTimerFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for TaskTimerFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, _config: &Config) -> bool {
        true
    }

    fn is_requested(&self, _task: &TaskRun) -> bool {
        true
    }

    fn new_task_feature(&self, _task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(TaskTimerTaskFeature { start: None })
    }

    fn name(&self) -> &'static str {
        "TaskTimer"
    }
}

struct TaskTimerTaskFeature {
    start: Option<Instant>,
}

impl TaskFeature for TaskTimerTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        self.start = Some(Instant::now());
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        if let Some(start) = self.start {
            let duration = start.elapsed();
            tracing::info!("=== Task Finished ===");
            tracing::info!("Task Duration: {:?}", duration);
        }
    }
}
