//! Engine glue code for task execution.
//!
//! Ported from the Go generic-worker insecure engine (insecure.go,
//! insecure_posix.go, insecure_linux.go, insecure_other.go).
//!
//! Provides platform-specific task environment setup, environment variable
//! construction, directory management, command generation, and old task
//! cleanup.

use anyhow::Result;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::model::GenericWorkerPayload;

/// Set up the platform task environment (task directory).
/// Returns whether a reboot is needed (always false for insecure engine).
///
/// Ports Go `PlatformTaskEnvironmentSetup` from insecure.go.
pub fn platform_task_environment_setup(task_dir_name: &str, config: &Config) -> bool {
    let task_dir = PathBuf::from(&config.tasks_dir).join(task_dir_name);
    if let Err(e) = std::fs::create_dir_all(&task_dir) {
        panic!(
            "Failed to create task directory {}: {}",
            task_dir.display(),
            e
        );
    }
    false
}

/// Build the environment variables for a task, matching the Go `EnvVars()` method
/// from insecure.go.
///
/// 1. Inherit all worker environment variables (except TASKCLUSTER_ACCESS_TOKEN)
/// 2. Merge payload.env (payload values override inherited ones)
/// 3. Add standard Taskcluster variables: TASK_ID, RUN_ID, TASK_WORKDIR,
///    TASK_GROUP_ID, TASKCLUSTER_ROOT_URL
/// 4. Conditionally add TASKCLUSTER_WORKER_LOCATION and TASKCLUSTER_INSTANCE_TYPE
pub fn env_vars(
    task_id: &str,
    run_id: u32,
    task_group_id: &str,
    task_dir: &Path,
    payload: &GenericWorkerPayload,
    config: &Config,
) -> Vec<(String, String)> {
    let mut task_env: HashMap<String, String> = HashMap::new();

    // 1. Inherit worker environment, excluding TASKCLUSTER_ACCESS_TOKEN
    for (key, value) in std::env::vars() {
        if key != "TASKCLUSTER_ACCESS_TOKEN" {
            task_env.insert(key, value);
        }
    }

    // 2. Merge payload.env (overrides inherited values)
    for (key, value) in &payload.env {
        task_env.insert(key.clone(), value.clone());
    }

    // 3. Add standard Taskcluster variables
    task_env.insert("TASK_ID".to_string(), task_id.to_string());
    task_env.insert("RUN_ID".to_string(), run_id.to_string());
    task_env.insert(
        "TASK_WORKDIR".to_string(),
        task_dir.display().to_string(),
    );
    task_env.insert("TASK_GROUP_ID".to_string(), task_group_id.to_string());
    task_env.insert(
        "TASKCLUSTER_ROOT_URL".to_string(),
        config.root_url.clone(),
    );

    // 4. Conditionally add worker location and instance type
    if !config.worker_location.is_empty() {
        task_env.insert(
            "TASKCLUSTER_WORKER_LOCATION".to_string(),
            config.worker_location.clone(),
        );
    }
    if !config.instance_type.is_empty() {
        task_env.insert(
            "TASKCLUSTER_INSTANCE_TYPE".to_string(),
            config.instance_type.clone(),
        );
    }

    let env_vec: Vec<(String, String)> = task_env.into_iter().collect();
    tracing::info!("Environment: {:?}", env_vec);
    env_vec
}

/// Delete a directory: chmod -R u+w then rm -rf (Unix), or platform equivalent.
///
/// Ports Go `deleteDir` from insecure.go.
pub fn delete_dir(path: &Path) -> Result<()> {
    tracing::info!("Removing directory '{}'...", path.display());

    // On Unix, first make everything writable so rm can succeed
    #[cfg(unix)]
    {
        if let Err(e) = crate::host::run("/bin/chmod", &["-R", "u+w", &path.display().to_string()])
        {
            tracing::warn!(
                "WARNING: could not chmod -R u+w '{}': {}",
                path.display(),
                e
            );
        }
    }

    // On Unix, use /bin/rm -rf for robustness (matches Go behavior)
    #[cfg(unix)]
    {
        if let Err(e) = crate::host::run("/bin/rm", &["-rf", &path.display().to_string()]) {
            tracing::warn!(
                "WARNING: could not delete directory '{}': {}",
                path.display(),
                e
            );
            return Err(e);
        }
    }

    // On Windows, use std::fs::remove_dir_all
    #[cfg(windows)]
    {
        if let Err(e) = std::fs::remove_dir_all(path) {
            tracing::warn!(
                "WARNING: could not delete directory '{}': {}",
                path.display(),
                e
            );
            return Err(anyhow::anyhow!(
                "could not delete directory '{}': {}",
                path.display(),
                e
            ));
        }
    }

    Ok(())
}

/// Rename a path, falling back to copy+delete if the rename fails
/// (e.g. when source and destination are on different devices).
///
/// Ports Go `RenameCrossDevice` from insecure.go.
pub fn rename_cross_device(old_path: &Path, new_path: &Path) -> Result<()> {
    // Try a simple rename first (covers 99% of cases)
    match std::fs::rename(old_path, new_path) {
        Ok(()) => Ok(()),
        Err(e) => {
            // Check if this is a cross-device link error
            #[cfg(unix)]
            {
                if e.raw_os_error() == Some(libc::EXDEV) {
                    tracing::debug!(
                        "Cross-device rename detected, falling back to copy+delete: {} -> {}",
                        old_path.display(),
                        new_path.display()
                    );
                    return copy_and_delete(old_path, new_path);
                }
            }
            #[cfg(windows)]
            {
                // ERROR_NOT_SAME_DEVICE = 17
                if e.raw_os_error() == Some(17) {
                    tracing::debug!(
                        "Cross-device rename detected, falling back to copy+delete: {} -> {}",
                        old_path.display(),
                        new_path.display()
                    );
                    return copy_and_delete(old_path, new_path);
                }
            }
            Err(anyhow::anyhow!(
                "failed to rename '{}' to '{}': {}",
                old_path.display(),
                new_path.display(),
                e
            ))
        }
    }
}

/// Copy a directory tree and then delete the source.
fn copy_and_delete(src: &Path, dst: &Path) -> Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let entry_path = entry.path();
            let dest_path = dst.join(entry.file_name());
            if entry_path.is_dir() {
                copy_and_delete(&entry_path, &dest_path)?;
            } else {
                std::fs::copy(&entry_path, &dest_path)?;
            }
        }
        std::fs::remove_dir_all(src)?;
    } else {
        std::fs::copy(src, dst)?;
        std::fs::remove_file(src)?;
    }
    Ok(())
}

/// Purge old task directories, skipping the current task directory.
///
/// Ports Go `purgeOldTasks` from insecure.go.
pub fn purge_old_tasks(config: &Config, current_task_dir_name: &str) {
    if !config.clean_up_task_dirs {
        tracing::warn!(
            "WARNING: Not purging previous task directories/users since config setting cleanUpTaskDirs is false"
        );
        return;
    }
    delete_task_dirs(&config.tasks_dir, &[current_task_dir_name]);
}

/// Delete all task directories under parent_dir, skipping those whose base
/// name is in skip_names. Matches Go `deleteTaskDirs` from main.go.
fn delete_task_dirs(parent_dir: &str, skip_names: &[&str]) {
    let entries = match std::fs::read_dir(parent_dir) {
        Ok(entries) => entries,
        Err(e) => {
            tracing::warn!("Could not read task directory '{}': {}", parent_dir, e);
            return;
        }
    };

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let name = match path.file_name().and_then(|n| n.to_str()) {
            Some(n) => n.to_string(),
            None => continue,
        };
        if skip_names.contains(&name.as_str()) {
            continue;
        }
        if let Err(e) = delete_dir(&path) {
            tracing::warn!(
                "WARNING: Could not delete task directory {}: {}",
                path.display(),
                e
            );
        }
    }
}

/// Return platform-specific features list names.
///
/// Ports Go `platformFeatures` from insecure_linux.go / insecure_other.go.
pub fn platform_features() -> Vec<&'static str> {
    #[cfg(target_os = "linux")]
    {
        vec![
            "loopbackAudio",
            "loopbackVideo",
            "artifact",
            "d2g",
        ]
    }
    #[cfg(any(target_os = "macos", target_os = "freebsd"))]
    {
        vec!["artifact"]
    }
    #[cfg(target_os = "windows")]
    {
        vec!["artifact"]
    }
}

/// Generate a process::Command from a task payload command at the given index.
///
/// Ports Go `generateCommand` from insecure.go.
pub fn generate_command(
    command_line: &[String],
    task_dir: &Path,
    env: Vec<(String, String)>,
) -> crate::process::Command {
    crate::process::CommandBuilder::new(command_line, &task_dir.display().to_string())
        .env(env)
        .build()
}

/// Format a command for logging with shell escaping.
///
/// Ports Go `formatCommand` from insecure.go which uses shell.Escape.
pub fn format_command(command: &[String]) -> String {
    command
        .iter()
        .map(|arg| shell_escape::escape(std::borrow::Cow::Borrowed(arg)).into_owned())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_command_simple() {
        let cmd = vec!["echo".to_string(), "hello".to_string()];
        assert_eq!(format_command(&cmd), "echo hello");
    }

    #[test]
    fn test_format_command_with_spaces() {
        let cmd = vec!["echo".to_string(), "hello world".to_string()];
        let formatted = format_command(&cmd);
        assert!(formatted.contains("hello"));
        // shell_escape should quote or escape the space
        assert!(formatted.contains('\'') || formatted.contains('\\'));
    }

    #[test]
    fn test_format_command_with_special_chars() {
        let cmd = vec!["/bin/bash".to_string(), "-c".to_string(), "echo $HOME".to_string()];
        let formatted = format_command(&cmd);
        assert!(formatted.starts_with("/bin/bash"));
    }

    #[test]
    fn test_rename_cross_device_same_device() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("source.txt");
        let dst = dir.path().join("dest.txt");
        std::fs::write(&src, "hello").unwrap();
        rename_cross_device(&src, &dst).unwrap();
        assert!(!src.exists());
        assert_eq!(std::fs::read_to_string(&dst).unwrap(), "hello");
    }

    #[test]
    fn test_delete_dir() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("subdir");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("file.txt"), "data").unwrap();
        delete_dir(&sub).unwrap();
        assert!(!sub.exists());
    }

    #[test]
    fn test_platform_features_not_empty() {
        let features = platform_features();
        assert!(!features.is_empty());
        assert!(features.contains(&"artifact"));
    }
}
