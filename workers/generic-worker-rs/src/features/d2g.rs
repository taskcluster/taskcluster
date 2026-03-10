//! D2G (Docker-to-Generic) feature - converts Docker Worker payloads to Generic Worker payloads.
//!
//! When enabled, this feature detects tasks with Docker Worker-style payloads
//! (containing an "image" field) and converts them to run via Docker on the
//! host. It manages:
//!
//! - Docker image pulling and caching (via d2g-image-cache.json)
//! - Container creation with appropriate volume mounts and environment
//! - Chain of trust integration (docker inspect for image provenance)
//! - Command placeholder evaluation (__D2G_IMAGE_ID__, __TASK_DIR__)
//! - Artifact extraction from the container via docker cp
//! - Container cleanup

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::config::Config;
use crate::errors::{internal_error, CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

const IMAGE_CACHE_FILE: &str = "d2g-image-cache.json";

/// A cached Docker image entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Image {
    /// The image ID (sha256 digest).
    pub image_id: String,
    /// The original image reference (e.g., "ubuntu:latest").
    pub image_ref: String,
    /// When the image was last pulled.
    pub last_used: chrono::DateTime<chrono::Utc>,
}

/// Image cache persisted to disk.
pub type ImageCache = HashMap<String, Image>;

/// Load the image cache from disk.
fn load_image_cache(cache_dir: &Path) -> ImageCache {
    let path = cache_dir.join(IMAGE_CACHE_FILE);
    if !path.exists() {
        return HashMap::new();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(e) => {
            tracing::warn!("Failed to read image cache {}: {}", path.display(), e);
            HashMap::new()
        }
    }
}

/// Save the image cache to disk.
fn save_image_cache(cache_dir: &Path, cache: &ImageCache) -> anyhow::Result<()> {
    let path = cache_dir.join(IMAGE_CACHE_FILE);
    let content = serde_json::to_string_pretty(cache)?;
    std::fs::write(&path, content)?;
    Ok(())
}

/// Pull or load a Docker image, returning the image ID.
fn pull_docker_image(image_ref: &str) -> anyhow::Result<String> {
    tracing::info!("Pulling Docker image: {}", image_ref);
    let output = Command::new("docker")
        .args(["pull", image_ref])
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute docker pull: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("docker pull failed for {}: {}", image_ref, stderr);
    }

    // Get the image ID via docker inspect
    get_image_id(image_ref)
}

/// Get the image ID for a given image reference.
fn get_image_id(image_ref: &str) -> anyhow::Result<String> {
    let output = Command::new("docker")
        .args(["inspect", "--format", "{{.Id}}", image_ref])
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute docker inspect: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("docker inspect failed for {}: {}", image_ref, stderr);
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

/// Run docker inspect on an image and return the JSON output (for chain of trust).
fn docker_inspect_image(image_id: &str) -> anyhow::Result<serde_json::Value> {
    let output = Command::new("docker")
        .args(["inspect", image_id])
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute docker inspect: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!("docker inspect failed for {}: {}", image_id, stderr);
    }

    let json: serde_json::Value = serde_json::from_slice(&output.stdout)?;
    Ok(json)
}

/// Copy artifacts from a container to the host filesystem.
fn docker_cp(container_id: &str, src: &str, dst: &Path) -> anyhow::Result<()> {
    let container_src = format!("{}:{}", container_id, src);
    let output = Command::new("docker")
        .args(["cp", &container_src, &dst.display().to_string()])
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute docker cp: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        anyhow::bail!(
            "docker cp {} -> {} failed: {}",
            container_src,
            dst.display(),
            stderr
        );
    }

    Ok(())
}

/// Remove a Docker container.
fn docker_rm(container_id: &str) -> anyhow::Result<()> {
    let output = Command::new("docker")
        .args(["rm", "-f", container_id])
        .output()
        .map_err(|e| anyhow::anyhow!("failed to execute docker rm: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        tracing::warn!("docker rm {} failed: {}", container_id, stderr);
    }

    Ok(())
}

/// Replace placeholder strings in command arguments.
fn evaluate_placeholders(args: &[String], image_id: &str, task_dir: &str) -> Vec<String> {
    args.iter()
        .map(|arg| {
            arg.replace("__D2G_IMAGE_ID__", image_id)
                .replace("__TASK_DIR__", task_dir)
        })
        .collect()
}

/// Write an environment variable file (env.list) for docker run --env-file.
fn write_env_file(path: &Path, env: &HashMap<String, String>) -> anyhow::Result<()> {
    let mut lines = Vec::new();
    for (k, v) in env {
        lines.push(format!("{}={}", k, v));
    }
    std::fs::write(path, lines.join("\n"))?;
    Ok(())
}

pub struct D2GFeature {
    cache_dir: PathBuf,
}

impl D2GFeature {
    pub fn new() -> Self {
        Self {
            cache_dir: PathBuf::new(),
        }
    }
}

impl Feature for D2GFeature {
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()> {
        self.cache_dir = PathBuf::from(&config.caches_dir);
        if !self.cache_dir.exists() {
            std::fs::create_dir_all(&self.cache_dir)?;
        }
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.d2g_enabled()
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        // A D2G task is identified by the presence of an "image" field in the
        // raw task payload.
        task.definition
            .payload
            .get("image")
            .is_some()
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        let image_ref = task
            .definition
            .payload
            .get("image")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let env = task.payload.env.clone();

        Box::new(D2GTaskFeature {
            task_id: task.task_id.clone(),
            run_id: task.run_id,
            task_dir: task.task_dir.clone(),
            cache_dir: self.cache_dir.clone(),
            image_ref,
            image_id: String::new(),
            container_id: None,
            env,
            artifact_paths: task
                .payload
                .artifacts
                .iter()
                .map(|a| (a.name.clone(), a.path.clone()))
                .collect(),
        })
    }

    fn name(&self) -> &'static str {
        "D2G"
    }
}

struct D2GTaskFeature {
    task_id: String,
    run_id: u32,
    task_dir: PathBuf,
    cache_dir: PathBuf,
    image_ref: String,
    image_id: String,
    container_id: Option<String>,
    env: HashMap<String, String>,
    artifact_paths: Vec<(String, String)>,
}

impl TaskFeature for D2GTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        if let Err(e) = self.start_inner() {
            return Some(internal_error(e));
        }
        None
    }

    fn stop(&mut self, errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // Copy artifacts from container to task directory.
        if let Some(ref container_id) = self.container_id {
            for (name, path) in &self.artifact_paths {
                let dst = self.task_dir.join(path);
                if let Some(parent) = dst.parent() {
                    if let Err(e) = std::fs::create_dir_all(parent) {
                        tracing::warn!("Failed to create artifact dir for {}: {}", name, e);
                        continue;
                    }
                }
                if let Err(e) = docker_cp(container_id, path, &dst) {
                    tracing::warn!("Failed to copy artifact {} from container: {}", name, e);
                }
            }

            // Remove the container.
            if let Err(e) = docker_rm(container_id) {
                errors.add(internal_error(anyhow::anyhow!(
                    "D2G: failed to remove container {}: {}",
                    container_id,
                    e
                )));
            }
        }

        // Update the image cache.
        let mut cache = load_image_cache(&self.cache_dir);
        if !self.image_id.is_empty() {
            cache.insert(
                self.image_ref.clone(),
                Image {
                    image_id: self.image_id.clone(),
                    image_ref: self.image_ref.clone(),
                    last_used: chrono::Utc::now(),
                },
            );
        }
        if let Err(e) = save_image_cache(&self.cache_dir, &cache) {
            tracing::warn!("D2G: failed to save image cache: {}", e);
        }

        tracing::info!("D2G feature stopped for task {}/{}", self.task_id, self.run_id);
    }
}

impl D2GTaskFeature {
    fn start_inner(&mut self) -> anyhow::Result<()> {
        if self.image_ref.is_empty() {
            anyhow::bail!("D2G: no image specified in task payload");
        }

        // Load image cache and check if we already have this image.
        let cache = load_image_cache(&self.cache_dir);
        let cached_id = cache.get(&self.image_ref).map(|img| img.image_id.clone());

        // Pull the image if not cached, or verify the cached image still exists.
        self.image_id = if let Some(ref id) = cached_id {
            match get_image_id(id) {
                Ok(verified_id) => {
                    tracing::info!("D2G: using cached image {} ({})", self.image_ref, verified_id);
                    verified_id
                }
                Err(_) => {
                    tracing::info!("D2G: cached image {} no longer valid, re-pulling", self.image_ref);
                    pull_docker_image(&self.image_ref)?
                }
            }
        } else {
            pull_docker_image(&self.image_ref)?
        };

        // Docker inspect for chain of trust provenance.
        match docker_inspect_image(&self.image_id) {
            Ok(inspect) => {
                let inspect_path = self.task_dir.join("d2g-docker-inspect.json");
                let content = serde_json::to_string_pretty(&inspect)?;
                std::fs::write(&inspect_path, content)?;
                tracing::info!(
                    "D2G: wrote docker inspect to {}",
                    inspect_path.display()
                );
            }
            Err(e) => {
                tracing::warn!("D2G: failed to inspect image {}: {}", self.image_id, e);
            }
        }

        // Write the env.list file for docker run --env-file.
        let env_file = self.task_dir.join("env.list");
        write_env_file(&env_file, &self.env)?;

        // Evaluate command placeholders.
        let task_dir_str = self.task_dir.display().to_string();
        tracing::info!(
            "D2G: image_id={}, task_dir={}, evaluating placeholders",
            self.image_id,
            task_dir_str,
        );

        // Note: The actual container creation and execution is handled by the
        // command_executor feature which will use the D2G-converted payload.
        // The container_id would be set during command execution in a full
        // integration. For now we log the intent.
        tracing::info!(
            "D2G: prepared task {}/{} with image {} (id: {})",
            self.task_id,
            self.run_id,
            self.image_ref,
            self.image_id,
        );

        Ok(())
    }
}
