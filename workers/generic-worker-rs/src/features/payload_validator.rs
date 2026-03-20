//! Payload validator feature - validates the task payload against the JSON schema.

use crate::config::Config;
use crate::errors::{malformed_payload_error, internal_error, CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct PayloadValidatorFeature;

impl PayloadValidatorFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for PayloadValidatorFeature {
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
        Box::new(PayloadValidatorTaskFeature {
            raw_payload: task.definition.payload.clone(),
            retry_exit_codes: task.payload.on_exit_status.retry.clone(),
            purge_caches_exit_codes: task.payload.on_exit_status.purge_caches.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "PayloadValidator"
    }
}

struct PayloadValidatorTaskFeature {
    raw_payload: serde_json::Value,
    retry_exit_codes: Vec<i64>,
    purge_caches_exit_codes: Vec<i64>,
}

impl TaskFeature for PayloadValidatorTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Validate the payload against the JSON schema
        let schema_str = crate::model::payload_schema_json();
        let schema_value: serde_json::Value = match serde_json::from_str(&schema_str) {
            Ok(v) => v,
            Err(e) => return Some(internal_error(anyhow::anyhow!("invalid payload schema: {e}"))),
        };

        // Try to validate using jsonschema
        match jsonschema::validator_for(&schema_value) {
            Ok(validator) => {
                if !validator.is_valid(&self.raw_payload) {
                    let errors: Vec<String> = validator
                        .iter_errors(&self.raw_payload)
                        .map(|e| e.to_string())
                        .collect();
                    if !errors.is_empty() {
                        return Some(malformed_payload_error(anyhow::anyhow!(
                            "payload validation failed:\n{}",
                            errors.join("\n")
                        )));
                    }
                }
            }
            Err(e) => {
                return Some(internal_error(anyhow::anyhow!(
                    "failed to compile schema: {e}"
                )));
            }
        }

        // Validate that retry exit codes are all >= 1.
        for code in &self.retry_exit_codes {
            if *code < 1 {
                return Some(malformed_payload_error(anyhow::anyhow!(
                    "onExitStatus.retry contains invalid exit code {}: exit codes must be >= 1",
                    code
                )));
            }
        }

        // Validate that purgeCaches exit codes are all >= 1.
        for code in &self.purge_caches_exit_codes {
            if *code < 1 {
                return Some(malformed_payload_error(anyhow::anyhow!(
                    "onExitStatus.purgeCaches contains invalid exit code {}: exit codes must be >= 1",
                    code
                )));
            }
        }

        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {}
}
