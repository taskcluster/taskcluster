//! Metadata feature - writes task metadata artifact.

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::fileutil;
use crate::model::MetadataInfo;
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

const METADATA_FILENAME: &str = "generic-worker-metadata.json";

pub struct MetadataFeature;

impl MetadataFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for MetadataFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_metadata
    }

    fn is_requested(&self, _task: &TaskRun) -> bool {
        true
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(MetadataTaskFeature {
            task_id: task.task_id.clone(),
            run_id: task.run_id,
            root_url: task.root_url.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "Metadata"
    }
}

struct MetadataTaskFeature {
    task_id: String,
    run_id: u32,
    root_url: String,
}

impl TaskFeature for MetadataTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        let info = MetadataInfo {
            last_task_url: format!(
                "{}/tasks/{}/runs/{}",
                self.root_url, self.task_id, self.run_id
            ),
        };
        if let Err(e) = fileutil::write_to_file_as_json(&info, METADATA_FILENAME) {
            tracing::error!("Failed to write metadata: {e}");
        }
    }
}
