//! Abort feature - monitors for graceful termination and aborts the task.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct AbortFeature;

impl AbortFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for AbortFeature {
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
        Box::new(AbortTaskFeature {
            stop_handler: None,
        })
    }

    fn name(&self) -> &'static str {
        "Abort"
    }
}

struct AbortTaskFeature {
    stop_handler: Option<Box<dyn FnOnce() + Send>>,
}

impl TaskFeature for AbortTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        let stop_fn = crate::graceful::on_termination_request(move |finish_tasks| {
            if !finish_tasks {
                tracing::warn!("Graceful termination requested without time to finish tasks");
                // In the full implementation, this would call task.StatusManager.Abort()
            }
        });
        self.stop_handler = Some(Box::new(stop_fn));
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        if let Some(handler) = self.stop_handler.take() {
            handler();
        }
    }
}
