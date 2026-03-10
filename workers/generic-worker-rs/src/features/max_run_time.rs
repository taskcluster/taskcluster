//! Max run time feature - enforces maximum task execution time.


use crate::config::Config;
use crate::errors::{malformed_payload_error, CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct MaxRunTimeFeature;

impl MaxRunTimeFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for MaxRunTimeFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, _config: &Config) -> bool {
        true
    }

    fn is_requested(&self, _task: &TaskRun) -> bool {
        true
    }

    fn new_task_feature(&self, task: &TaskRun, config: &Config) -> Box<dyn TaskFeature> {
        Box::new(MaxRunTimeTaskFeature {
            max_run_time: task.payload.max_run_time,
            max_allowed: config.max_task_run_time,
        })
    }

    fn name(&self) -> &'static str {
        "MaxRunTime"
    }
}

struct MaxRunTimeTaskFeature {
    max_run_time: i64,
    max_allowed: u32,
}

impl TaskFeature for MaxRunTimeTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Validate max run time is positive
        if self.max_run_time <= 0 {
            return Some(malformed_payload_error(anyhow::anyhow!(
                "maxRunTime must be a positive integer, got {}",
                self.max_run_time
            )));
        }

        // Validate max run time against config limit
        if self.max_allowed > 0 && self.max_run_time > self.max_allowed as i64 {
            return Some(malformed_payload_error(anyhow::anyhow!(
                "task maxRunTime of {} exceeds the worker's configured max of {} seconds",
                self.max_run_time,
                self.max_allowed
            )));
        }

        // The actual timer is managed by the task runner
        tracing::info!("Task max run time: {}s", self.max_run_time);
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // Timer cleanup is handled by the task runner
    }
}
