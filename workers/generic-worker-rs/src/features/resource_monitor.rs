//! Resource monitor feature - monitors system memory during task execution.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct ResourceMonitorFeature;

impl ResourceMonitorFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for ResourceMonitorFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_resource_monitor
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.resource_monitor
    }

    fn new_task_feature(&self, _task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(ResourceMonitorTaskFeature)
    }

    fn name(&self) -> &'static str {
        "ResourceMonitor"
    }
}

struct ResourceMonitorTaskFeature;

impl TaskFeature for ResourceMonitorTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // TODO: Set up resource monitors on each command
        // This is done by setting the ResourceMonitor callback on each Command
        tracing::info!("Resource monitor feature started");
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {}
}
