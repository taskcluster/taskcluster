//! Command executor feature - executes task commands.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct CommandExecutorFeature;

impl CommandExecutorFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for CommandExecutorFeature {
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
        Box::new(CommandExecutorTaskFeature)
    }

    fn name(&self) -> &'static str {
        "CommandExecutor"
    }
}

struct CommandExecutorTaskFeature;

impl TaskFeature for CommandExecutorTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Command execution is handled by the task runner in the worker module.
        // This feature serves as a placeholder in the feature chain.
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {}
}
