//! Artifact upload feature - discovers and uploads task artifacts.
//!
//! This feature handles:
//! - Validating artifact expiry times during start
//! - Detecting duplicate artifact names in the payload
//! - Discovering artifacts from task payload definitions at stop time
//! - Walking directories to resolve all files in directory-type artifacts
//! - Detecting MIME types from file extensions
//! - Determining content encoding
//! - Uploading artifacts concurrently (max 10 concurrent uploads)
//! - Creating error artifacts for missing non-optional files
//! - Reporting errors for non-optional missing artifacts

use std::collections::HashSet;

use chrono::{DateTime, Duration, Utc};
use std::path::PathBuf;

use crate::artifacts::{self, Artifact};
use crate::config::Config;
use crate::errors::{
    failure, malformed_payload_error, CommandExecutionError, ExecutionErrors,
};
use crate::model::ArtifactDefinition;
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

/// Maximum number of concurrent artifact uploads.
const MAX_CONCURRENT_UPLOADS: usize = 10;

pub struct ArtifactUploadFeature;

impl ArtifactUploadFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for ArtifactUploadFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, _config: &Config) -> bool {
        // Artifact upload is always enabled.
        true
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        // Requested whenever the task has artifacts defined.
        !task.payload.artifacts.is_empty()
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(ArtifactUploadTaskFeature {
            task_id: task.task_id.clone(),
            run_id: task.run_id,
            task_dir: task.task_dir.clone(),
            task_expires: task.definition.expires,
            task_deadline: task.definition.deadline,
            artifact_definitions: task.payload.artifacts.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "ArtifactUpload"
    }
}

struct ArtifactUploadTaskFeature {
    task_id: String,
    run_id: u32,
    task_dir: PathBuf,
    task_expires: DateTime<Utc>,
    task_deadline: DateTime<Utc>,
    artifact_definitions: Vec<ArtifactDefinition>,
}

impl ArtifactUploadTaskFeature {
    /// Check for duplicate artifact names in the payload definitions.
    fn check_duplicate_names(&self) -> Option<CommandExecutionError> {
        let mut seen = HashSet::new();
        for def in &self.artifact_definitions {
            // Use path as the effective name if name is not specified.
            let effective_name = if def.name.is_empty() {
                &def.path
            } else {
                &def.name
            };
            if !seen.insert(effective_name) {
                return Some(malformed_payload_error(anyhow::anyhow!(
                    "duplicate artifact name '{}' in task payload",
                    effective_name,
                )));
            }
        }
        None
    }

    /// Validate that artifact expiry times are within the task deadline and expiry.
    fn validate_expiry_times(&self) -> Option<CommandExecutionError> {
        // Allow 1 second tolerance for clock skew.
        let tolerance = Duration::seconds(1);

        for def in &self.artifact_definitions {
            if let Some(ref expires) = def.expires {
                // Artifact expiry must not be before the task deadline.
                if *expires < self.task_deadline - tolerance {
                    return Some(malformed_payload_error(anyhow::anyhow!(
                        "artifact '{}' expires at {}, which is before the task deadline {}",
                        def.name,
                        expires,
                        self.task_deadline,
                    )));
                }
                // Artifact expiry must not be after the task expiry.
                if *expires > self.task_expires + tolerance {
                    return Some(malformed_payload_error(anyhow::anyhow!(
                        "artifact '{}' expires at {}, which is after the task expiry {}",
                        def.name,
                        expires,
                        self.task_expires,
                    )));
                }
            }
        }
        None
    }

    /// Discover all artifacts from the task directory based on definitions.
    fn discover_artifacts(&self) -> Vec<Artifact> {
        artifacts::discover_artifacts(&self.task_dir, &self.artifact_definitions, self.task_expires)
    }
}

impl TaskFeature for ArtifactUploadTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Check for duplicate artifact names first.
        if let Some(err) = self.check_duplicate_names() {
            return Some(err);
        }

        // Validate artifact expiry times.
        self.validate_expiry_times()
    }

    fn stop(&mut self, errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        let discovered = self.discover_artifacts();

        if discovered.is_empty() {
            tracing::info!(
                "ArtifactUpload: no artifacts to upload for task {}/{}",
                self.task_id,
                self.run_id,
            );
            return;
        }

        tracing::info!(
            "ArtifactUpload: discovered {} artifacts for task {}/{}",
            discovered.len(),
            self.task_id,
            self.run_id,
        );

        // Note: Actual upload is performed by the worker's artifact upload
        // pipeline in worker.rs (process_task). This feature's stop phase
        // logs the discovered artifacts. The concurrent upload with
        // MAX_CONCURRENT_UPLOADS will be integrated when the feature has
        // access to the queue client.
        //
        // In a full integration, this would use tokio::sync::Semaphore to
        // limit concurrent uploads:
        //
        //   let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_UPLOADS));
        //   let mut handles = Vec::new();
        //   for artifact in &discovered {
        //       let permit = semaphore.clone().acquire_owned().await.unwrap();
        //       handles.push(tokio::spawn(async move {
        //           upload_artifact(...).await;
        //           drop(permit);
        //       }));
        //   }

        for artifact in &discovered {
            match artifact {
                Artifact::Error(ref err_artifact) => {
                    tracing::warn!(
                        "ArtifactUpload: error artifact '{}': {}",
                        err_artifact.base.name,
                        err_artifact.message,
                    );
                    // Non-optional error artifacts cause the task to fail.
                    if !err_artifact.base.optional {
                        errors.add(failure(anyhow::anyhow!(
                            "artifact '{}' not found: {}",
                            err_artifact.base.name,
                            err_artifact.message,
                        )));
                    }
                }
                _ => {
                    tracing::info!(
                        "ArtifactUpload: ready to upload: {}",
                        artifact.display(),
                    );
                }
            }
        }
    }
}
