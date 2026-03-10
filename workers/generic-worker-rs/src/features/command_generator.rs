//! Command generator feature - generates OS commands from the task payload.

use crate::config::Config;
use crate::errors::{internal_error, CommandExecutionError, ExecutionErrors};
use crate::process::{Command, CommandBuilder, PlatformData};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct CommandGeneratorFeature;

impl CommandGeneratorFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for CommandGeneratorFeature {
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
        Box::new(CommandGeneratorTaskFeature {
            commands: task.payload.command.clone(),
            task_dir: task.task_dir.display().to_string(),
            env: task.payload.env.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "CommandGenerator"
    }
}

struct CommandGeneratorTaskFeature {
    commands: Vec<Vec<String>>,
    task_dir: String,
    env: std::collections::HashMap<String, String>,
}

impl TaskFeature for CommandGeneratorTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Commands are generated when the task is executed, not here.
        // This feature validates that commands are well-formed.
        for (i, cmd) in self.commands.iter().enumerate() {
            if cmd.is_empty() {
                return Some(internal_error(anyhow::anyhow!(
                    "command {} is empty",
                    i
                )));
            }
            tracing::debug!("Command {}: {:?}", i, cmd);
        }
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {}
}

/// Generate a process::Command from a command line specification.
pub fn generate_command(
    command_line: &[String],
    working_directory: &str,
    env: &std::collections::HashMap<String, String>,
    platform_data: &PlatformData,
) -> anyhow::Result<Command> {
    let env_vars: Vec<(String, String)> = env.iter().map(|(k, v)| (k.clone(), v.clone())).collect();

    let cmd = CommandBuilder::new(command_line, working_directory)
        .env(env_vars)
        .platform_data(platform_data.clone())
        .build();

    Ok(cmd)
}
