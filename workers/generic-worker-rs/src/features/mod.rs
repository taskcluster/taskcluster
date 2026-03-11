//! Feature plugin system.
//!
//! Features are the primary extension mechanism for the worker. Each feature
//! can hook into the task lifecycle at Start() and Stop() points.
//!
//! Features are initialized once at worker startup and create per-task
//! instances for each claimed task.

mod abort;
mod artifact_upload;
mod backing_log;
mod chain_of_trust;
mod command_executor;
mod command_generator;
mod d2g;
mod interactive;
mod livelog;
mod loopback_audio;
mod loopback_video;
mod max_run_time;
mod metadata;
mod mounts;
mod os_groups;
mod payload_validator;
mod rdp;
mod resource_monitor;
mod run_as_administrator;
mod run_as_current_user;
mod task_timer;
mod taskcluster_proxy;

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

/// Context passed to TaskFeature::stop(), providing access to task execution
/// results that features may need for their cleanup logic.
pub struct StopContext {
    /// The exit code of the last command executed by the task.
    pub last_exit_code: i32,
    /// Exit codes from onExitStatus.purgeCaches that trigger cache purging.
    pub purge_caches_exit_codes: Vec<i64>,
}

/// A global feature that persists for the worker's lifetime.
pub trait Feature: Send + Sync {
    /// Initialize the feature. Called once at worker startup.
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()>;

    /// Whether this feature is enabled in the worker configuration.
    fn is_enabled(&self, config: &Config) -> bool;

    /// Whether this feature is requested for a specific task.
    fn is_requested(&self, task: &TaskRun) -> bool;

    /// Create a per-task feature instance.
    fn new_task_feature(&self, task: &TaskRun, config: &Config) -> Box<dyn TaskFeature>;

    /// Whether requesting this feature when it's disabled should cause a
    /// malformed-payload error. Override to return true for features that
    /// must be explicitly enabled in the worker config.
    fn rejects_when_disabled(&self) -> bool {
        false
    }

    /// Human-readable name for logging.
    fn name(&self) -> &'static str;
}

/// A per-task feature instance that hooks into the task lifecycle.
pub trait TaskFeature: Send {
    /// Scopes required by this feature for the current task.
    fn required_scopes(&self) -> Vec<Vec<String>> {
        Vec::new()
    }

    /// Artifact names reserved by this feature.
    fn reserved_artifacts(&self) -> Vec<String> {
        Vec::new()
    }

    /// Called when the task starts. Returns an error to abort the task.
    fn start(&mut self) -> Option<CommandExecutionError> {
        None
    }

    /// Called when the task stops. Can accumulate additional errors.
    fn stop(&mut self, errors: &mut ExecutionErrors, _ctx: &StopContext) {}
}

/// Initialize all features and return them in execution order.
pub fn initialise_features(config: &Config) -> anyhow::Result<Vec<Box<dyn Feature>>> {
    let mut features: Vec<Box<dyn Feature>> = vec![
        Box::new(abort::AbortFeature::new()),
        Box::new(backing_log::BackingLogFeature::new()),
        Box::new(payload_validator::PayloadValidatorFeature::new()),
        Box::new(d2g::D2GFeature::new()),
        Box::new(command_generator::CommandGeneratorFeature::new()),
        Box::new(livelog::LiveLogFeature::new()),
        Box::new(taskcluster_proxy::TaskclusterProxyFeature::new()),
        Box::new(interactive::InteractiveFeature::new()),
        Box::new(loopback_audio::LoopbackAudioFeature::new()),
        Box::new(loopback_video::LoopbackVideoFeature::new()),
        Box::new(os_groups::OsGroupsFeature::new()),
        Box::new(run_as_current_user::RunAsCurrentUserFeature::new()),
        // RunAsAdministrator depends on OSGroups (must appear after it).
        Box::new(run_as_administrator::RunAsAdministratorFeature::new()),
        Box::new(rdp::RDPFeature::new()),
        Box::new(mounts::MountsFeature::new()),
        Box::new(artifact_upload::ArtifactUploadFeature::new()),
        Box::new(resource_monitor::ResourceMonitorFeature::new()),
        Box::new(metadata::MetadataFeature::new()),
        Box::new(max_run_time::MaxRunTimeFeature::new()),
        Box::new(task_timer::TaskTimerFeature::new()),
        Box::new(command_executor::CommandExecutorFeature::new()),
        Box::new(chain_of_trust::ChainOfTrustFeature::new()),
    ];

    for feature in &mut features {
        if feature.is_enabled(config) {
            feature.initialise(config)?;
            tracing::debug!("Initialized feature: {}", feature.name());
        }
    }

    Ok(features)
}

/// Run the feature start phase for a task.
///
/// Creates task features for all enabled and requested features,
/// calls Start() on each, and returns the list of active task features.
pub fn start_features(
    features: &[Box<dyn Feature>],
    task: &TaskRun,
    config: &Config,
) -> (Vec<Box<dyn TaskFeature>>, Option<CommandExecutionError>) {
    let mut task_features = Vec::new();

    for feature in features {
        if !feature.is_enabled(config) {
            // If the feature is disabled but the task requests it,
            // report malformed-payload.
            if feature.is_requested(task) && feature.rejects_when_disabled() {
                let err = crate::errors::malformed_payload_error(
                    anyhow::anyhow!(
                        "task payload requests feature '{}' which is not enabled on this worker",
                        feature.name()
                    ),
                );
                return (task_features, Some(err));
            }
            continue;
        }
        if !feature.is_requested(task) {
            continue;
        }

        let mut tf = feature.new_task_feature(task, config);

        // Check required scopes
        let required = tf.required_scopes();
        if !required.is_empty() {
            // TODO: Validate task scopes against required scopes
        }

        // Check reserved artifacts
        let reserved = tf.reserved_artifacts();
        for name in &reserved {
            if task.feature_artifacts.contains_key(name) {
                let err = crate::errors::malformed_payload_error(
                    anyhow::anyhow!(
                        "artifact {} is reserved by feature {}",
                        name,
                        feature.name()
                    ),
                );
                return (task_features, Some(err));
            }
        }

        // Start the feature
        if let Some(err) = tf.start() {
            return (task_features, Some(err));
        }

        task_features.push(tf);
    }

    (task_features, None)
}

/// Run the feature stop phase for a task.
///
/// Calls Stop() on all active task features in reverse order.
pub fn stop_features(task_features: &mut Vec<Box<dyn TaskFeature>>, errors: &mut ExecutionErrors, ctx: &StopContext) {
    // Stop in reverse order
    for tf in task_features.iter_mut().rev() {
        tf.stop(errors, ctx);
    }
}
