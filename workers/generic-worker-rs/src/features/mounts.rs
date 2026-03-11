//! Mounts feature - handles file mounts, directory caches, and read-only directories.
//!
//! This implements the full mounts feature including:
//! - File mounts (download a file and place it in the task directory)
//! - Read-only directory mounts (download an archive and extract it)
//! - Writable directory cache mounts (persistent caches across tasks)
//! - Content download from various sources (artifact, URL, raw, base64, indexed)
//! - SHA256 verification of downloaded content
//! - Archive extraction (tar.gz, tar.bz2, tar.xz, tar.zst, tar.lz4, zip)
//! - File decompression (gz, bz2, xz, zst, lz4)
//! - Purge cache service integration
//! - Cache state persistence to JSON files

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use base64::Engine;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::fileutil;
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

// ---------------------------------------------------------------------------
// Cache persistence types
// ---------------------------------------------------------------------------

/// A single cache entry, persisted to JSON.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Cache {
    /// When the cache was created.
    pub created: DateTime<Utc>,
    /// Full path to the cache on disk (could be file or directory).
    pub location: String,
    /// Number of times this cache has been used by a task on this worker.
    pub hits: u64,
    /// The key used in the CacheMap.
    pub key: String,
    /// SHA256 of content (for file caches, not used for directories).
    #[serde(default)]
    pub sha256: String,
    /// Username of the user that last mounted this cache.
    #[serde(default)]
    pub owner_username: String,
    /// UID of the user that last mounted this cache.
    #[serde(default, rename = "mounterUID")]
    pub owner_uid: String,
}

impl Cache {
    /// Rating determines how valuable the cache is compared to other caches.
    /// Based on number of hits (more hits = more valuable).
    pub fn rating(&self) -> f64 {
        self.hits as f64
    }

    /// Evict this cache entry from the given map and remove its files from disk.
    pub fn evict(key: &str, map: &mut CacheMap) -> anyhow::Result<()> {
        if let Some(cache) = map.remove(key) {
            tracing::info!("[mounts] Removing cache {} from table", key);
            tracing::info!(
                "[mounts] Deleting cache {} file(s) at {}",
                key,
                cache.location
            );
            let path = Path::new(&cache.location);
            if path.exists() {
                if path.is_dir() {
                    fs::remove_dir_all(path)?;
                } else {
                    fs::remove_file(path)?;
                }
            }
        }
        Ok(())
    }
}

/// Map of cache key to Cache entry.
pub type CacheMap = HashMap<String, Cache>;

/// Load a CacheMap from a JSON state file. If the file does not exist, creates
/// an empty CacheMap and ensures the cache directory exists.
pub fn load_cache_map(state_file: &str, cache_dir: &str) -> CacheMap {
    let path = Path::new(state_file);
    if !path.exists() {
        tracing::info!(
            "[mounts] No {} file found, creating empty CacheMap",
            state_file
        );
        let dir = Path::new(cache_dir);
        if !dir.exists() {
            tracing::info!(
                "[mounts] Creating worker cache directory {} with permissions 0700",
                cache_dir
            );
            if let Err(e) = fs::create_dir_all(dir) {
                tracing::error!(
                    "[mounts] Cannot create worker cache directory {}: {}",
                    cache_dir,
                    e
                );
            }
        }
        return CacheMap::new();
    }

    match fs::read_to_string(path) {
        Ok(content) => match serde_json::from_str::<CacheMap>(&content) {
            Ok(mut map) => {
                // Remove entries whose files/directories no longer exist on disk.
                let keys_to_remove: Vec<String> = map
                    .iter()
                    .filter(|(_, cache)| !Path::new(&cache.location).exists())
                    .map(|(key, cache)| {
                        tracing::warn!(
                            "[mounts] Cache {:?} missing on worker at {} - corrupt internal state, ignoring",
                            key,
                            cache.location
                        );
                        key.clone()
                    })
                    .collect();
                for key in keys_to_remove {
                    map.remove(&key);
                }
                map
            }
            Err(e) => {
                tracing::error!(
                    "[mounts] Cannot parse cache state file {}: {}",
                    state_file,
                    e
                );
                CacheMap::new()
            }
        },
        Err(e) => {
            tracing::error!(
                "[mounts] Cannot read cache state file {}: {}",
                state_file,
                e
            );
            CacheMap::new()
        }
    }
}

/// Save a CacheMap to a JSON state file.
pub fn save_cache_map(map: &CacheMap, state_file: &str) -> anyhow::Result<()> {
    fileutil::write_to_file_as_json(map, state_file)
}

/// Return caches sorted by rating (lowest first, for eviction).
pub fn sorted_by_rating(map: &CacheMap) -> Vec<(String, f64)> {
    let mut entries: Vec<(String, f64)> = map
        .iter()
        .map(|(k, c)| (k.clone(), c.rating()))
        .collect();
    entries.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    entries
}

// ---------------------------------------------------------------------------
// Global mutable cache state
//
// These are module-level state that persists across tasks, matching the Go
// implementation's global variables. We use std::sync::Mutex since the worker
// processes tasks sequentially.
// ---------------------------------------------------------------------------

use std::sync::Mutex;

static FILE_CACHES: Mutex<Option<CacheMap>> = Mutex::new(None);
static DIRECTORY_CACHES: Mutex<Option<CacheMap>> = Mutex::new(None);
static LAST_PURGE_CACHE_QUERY: Mutex<Option<DateTime<Utc>>> = Mutex::new(None);

fn with_file_caches<F, R>(f: F) -> R
where
    F: FnOnce(&mut CacheMap) -> R,
{
    let mut guard = FILE_CACHES.lock().expect("file caches lock poisoned");
    let map = guard.get_or_insert_with(CacheMap::new);
    f(map)
}

fn with_directory_caches<F, R>(f: F) -> R
where
    F: FnOnce(&mut CacheMap) -> R,
{
    let mut guard = DIRECTORY_CACHES.lock().expect("directory caches lock poisoned");
    let map = guard.get_or_insert_with(CacheMap::new);
    f(map)
}

// ---------------------------------------------------------------------------
// Content source types
// ---------------------------------------------------------------------------

/// Content source for a mount.
#[derive(Debug, Clone)]
enum ContentSource {
    Artifact {
        task_id: String,
        artifact: String,
        sha256: String,
    },
    Indexed {
        namespace: String,
        artifact: String,
    },
    Url {
        url: String,
        sha256: String,
    },
    Raw {
        raw: String,
        sha256: String,
    },
    Base64 {
        base64: String,
        sha256: String,
    },
}

impl ContentSource {
    /// Parse a content source from a JSON value.
    fn from_json(value: &serde_json::Value) -> Option<Self> {
        if let Some(task_id) = value.get("taskId").and_then(|v| v.as_str()) {
            Some(ContentSource::Artifact {
                task_id: task_id.to_string(),
                artifact: value
                    .get("artifact")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                sha256: value
                    .get("sha256")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        } else if let Some(namespace) = value.get("namespace").and_then(|v| v.as_str()) {
            Some(ContentSource::Indexed {
                namespace: namespace.to_string(),
                artifact: value
                    .get("artifact")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        } else if let Some(url) = value.get("url").and_then(|v| v.as_str()) {
            Some(ContentSource::Url {
                url: url.to_string(),
                sha256: value
                    .get("sha256")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        } else if let Some(raw) = value.get("raw").and_then(|v| v.as_str()) {
            Some(ContentSource::Raw {
                raw: raw.to_string(),
                sha256: value
                    .get("sha256")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        } else if let Some(b64) = value.get("base64").and_then(|v| v.as_str()) {
            Some(ContentSource::Base64 {
                base64: b64.to_string(),
                sha256: value
                    .get("sha256")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            })
        } else {
            None
        }
    }

    /// A unique key identifying this content source, used for file cache lookups.
    fn unique_key(&self, root_url: &str) -> anyhow::Result<String> {
        match self {
            ContentSource::Artifact {
                task_id, artifact, ..
            } => Ok(format!("artifact:{}:{}", task_id, artifact)),
            ContentSource::Indexed {
                namespace,
                artifact,
            } => {
                // Resolve the namespace to a task ID via the index service.
                // For the cache key, we use the namespace directly since
                // the resolved task may change over time.
                let task_id = resolve_indexed_task(root_url, namespace)?;
                Ok(format!("artifact:{}:{}", task_id, artifact))
            }
            ContentSource::Url { url, .. } => Ok(format!("urlcontent:{}", url)),
            ContentSource::Raw { raw, .. } => Ok(format!("Raw content: {}", raw)),
            ContentSource::Base64 { base64, .. } => Ok(format!("Base64 content: {}", base64)),
        }
    }

    /// The required SHA256 hash, if specified by the task payload.
    fn required_sha256(&self) -> &str {
        match self {
            ContentSource::Artifact { sha256, .. } => sha256,
            ContentSource::Url { sha256, .. } => sha256,
            ContentSource::Raw { sha256, .. } => sha256,
            ContentSource::Base64 { sha256, .. } => sha256,
            // Indexed content type does not have required SHA256.
            _ => "",
        }
    }

    /// Task dependencies required by this content source.
    fn task_dependencies(&self) -> Vec<String> {
        match self {
            ContentSource::Artifact { task_id, .. } => vec![task_id.clone()],
            _ => vec![],
        }
    }

    /// Human-readable description of the content source.
    fn description(&self) -> String {
        match self {
            ContentSource::Artifact {
                task_id, artifact, ..
            } => format!("task {} artifact {}", task_id, artifact),
            ContentSource::Indexed {
                namespace,
                artifact,
            } => format!("namespace {} artifact {}", namespace, artifact),
            ContentSource::Url { url, .. } => format!("url {}", url),
            ContentSource::Raw { raw, .. } => format!("Raw ({})", raw),
            ContentSource::Base64 { base64, .. } => format!("Base64 ({})", base64),
        }
    }

    /// Download the content to a file in the downloads directory.
    /// Returns (file_path, sha256_hash).
    fn download(&self, downloads_dir: &str, root_url: &str) -> anyhow::Result<(String, String)> {
        let basename = generate_slug();
        let file = PathBuf::from(downloads_dir).join(&basename);
        let file_str = file.display().to_string();

        match self {
            ContentSource::Artifact {
                task_id, artifact, ..
            } => {
                tracing::info!(
                    "[mounts] Downloading artifact {} from task {} to {}",
                    artifact,
                    task_id,
                    file_str
                );
                download_artifact(root_url, task_id, artifact, &file)?;
                let sha256 = fileutil::calculate_sha256(&file)?;
                tracing::info!(
                    "[mounts] Downloaded artifact with SHA256 {} to {}",
                    sha256,
                    file_str
                );
                Ok((file_str, sha256))
            }
            ContentSource::Indexed {
                namespace,
                artifact,
            } => {
                tracing::info!(
                    "[mounts] Resolving indexed content namespace {} artifact {}",
                    namespace,
                    artifact
                );
                let task_id = resolve_indexed_task(root_url, namespace)?;
                tracing::info!(
                    "[mounts] Resolved namespace {} to task {}, downloading artifact {} to {}",
                    namespace,
                    task_id,
                    artifact,
                    file_str
                );
                download_artifact(root_url, &task_id, artifact, &file)?;
                let sha256 = fileutil::calculate_sha256(&file)?;
                tracing::info!(
                    "[mounts] Downloaded indexed artifact with SHA256 {} to {}",
                    sha256,
                    file_str
                );
                Ok((file_str, sha256))
            }
            ContentSource::Url { url, .. } => {
                tracing::info!("[mounts] Downloading {} to {}", url, file_str);
                download_url_with_retry(url, &file)?;
                let sha256 = fileutil::calculate_sha256(&file)?;
                tracing::info!(
                    "[mounts] Downloaded {} bytes with SHA256 {} from {} to {}",
                    fs::metadata(&file).map(|m| m.len()).unwrap_or(0),
                    sha256,
                    url,
                    file_str
                );
                Ok((file_str, sha256))
            }
            ContentSource::Raw { raw, .. } => {
                tracing::info!("[mounts] Writing raw content to {}", file_str);
                fs::write(&file, raw)?;
                let sha256 = fileutil::calculate_sha256(&file)?;
                tracing::info!(
                    "[mounts] Wrote {} bytes of raw content to {}",
                    raw.len(),
                    file_str
                );
                Ok((file_str, sha256))
            }
            ContentSource::Base64 { base64: b64_str, .. } => {
                tracing::info!("[mounts] Decoding base64 content to {}", file_str);
                let decoded = base64::engine::general_purpose::STANDARD
                    .decode(b64_str)
                    .map_err(|e| anyhow::anyhow!("invalid base64 content: {}", e))?;
                fs::write(&file, &decoded)?;
                let sha256 = fileutil::calculate_sha256(&file)?;
                tracing::info!(
                    "[mounts] Wrote {} bytes of base64-decoded content to {}",
                    decoded.len(),
                    file_str
                );
                Ok((file_str, sha256))
            }
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/// Generate a slug ID (URL-safe random string) for filenames.
fn generate_slug() -> String {
    let uuid = Uuid::new_v4();
    // Use base64url-safe encoding of the UUID bytes, trimmed.
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(uuid.as_bytes())
}

/// Download an artifact from the Taskcluster Queue.
fn download_artifact(
    root_url: &str,
    task_id: &str,
    artifact: &str,
    destination: &Path,
) -> anyhow::Result<()> {
    // Use the latest run (-1 equivalent: omit runId, use getLatestArtifact)
    let url = format!(
        "{}/api/queue/v1/task/{}/artifacts/{}",
        root_url, task_id, artifact
    );
    download_url_with_retry(&url, destination).map_err(|e| {
        anyhow::anyhow!(
            "Could not fetch from task {} artifact {} into file {}: {}",
            task_id,
            artifact,
            destination.display(),
            e
        )
    })
}

/// Resolve an indexed task namespace to a task ID.
fn resolve_indexed_task(root_url: &str, namespace: &str) -> anyhow::Result<String> {
    let url = format!(
        "{}/api/index/v1/task/{}",
        root_url, namespace
    );
    // Synchronous HTTP request using reqwest blocking client.
    let resp = reqwest::blocking::get(&url)
        .map_err(|e| anyhow::anyhow!("failed to query index service for namespace {}: {}", namespace, e))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().unwrap_or_default();
        anyhow::bail!(
            "index service returned {} for namespace {}: {}",
            status,
            namespace,
            body
        );
    }
    let body: serde_json::Value = resp.json()?;
    let task_id = body
        .get("taskId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("index response missing taskId for namespace {}", namespace))?;
    Ok(task_id.to_string())
}

/// Download a URL to a local file with retry logic.
fn download_url_with_retry(url: &str, destination: &Path) -> anyhow::Result<()> {
    let max_retries = 5;
    let mut last_error = None;

    for attempt in 0..max_retries {
        if attempt > 0 {
            let delay = std::time::Duration::from_millis(500 * 2u64.pow(attempt as u32));
            tracing::info!(
                "[mounts] Retry attempt {} for {} (waiting {:?})",
                attempt,
                url,
                delay
            );
            std::thread::sleep(delay);
        }

        match download_url_once(url, destination) {
            Ok(()) => return Ok(()),
            Err(e) => {
                tracing::warn!(
                    "[mounts] Download attempt {} of {} failed: {}",
                    attempt + 1,
                    url,
                    e
                );
                last_error = Some(e);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("download failed with no error detail")))
}

/// Single attempt to download a URL to a file.
fn download_url_once(url: &str, destination: &Path) -> anyhow::Result<()> {
    let resp = reqwest::blocking::get(url)
        .map_err(|e| anyhow::anyhow!("HTTP request failed for {}: {}", url, e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        anyhow::bail!("HTTP {} downloading {}", status, url);
    }

    let bytes = resp
        .bytes()
        .map_err(|e| anyhow::anyhow!("failed to read response body from {}: {}", url, e))?;

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(destination, &bytes)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Ensure cached (file cache with SHA256 verification)
// ---------------------------------------------------------------------------

/// Ensure the given content is in the file cache. Returns the path to the
/// cached file. Downloads if not already cached, verifies SHA256 if required.
fn ensure_cached(
    content: &ContentSource,
    downloads_dir: &str,
    root_url: &str,
) -> anyhow::Result<String> {
    let cache_key = content.unique_key(root_url)?;
    let required_sha256 = content.required_sha256();

    // Check if already in cache.
    let cached = with_file_caches(|fc| {
        if let Some(entry) = fc.get_mut(&cache_key) {
            let path = Path::new(&entry.location);
            if !path.exists() {
                tracing::error!(
                    "[mounts] File in cache but not on filesystem: {}",
                    entry.location
                );
                fc.remove(&cache_key);
                return None;
            }
            entry.hits += 1;
            Some(entry.location.clone())
        } else {
            None
        }
    });

    if let Some(file) = cached {
        // Validate SHA256 of cached file.
        let sha256 = fileutil::calculate_sha256(Path::new(&file))?;

        if required_sha256.is_empty() {
            tracing::warn!(
                "[mounts] No SHA256 specified for {} - SHA256 of cached file {} is {}",
                cache_key,
                file,
                sha256
            );
            return Ok(file);
        }
        if required_sha256 == sha256 {
            tracing::info!(
                "[mounts] Found existing download for {} ({}) with correct SHA256 {}",
                cache_key,
                file,
                sha256
            );
            return Ok(file);
        }

        // SHA256 mismatch - evict and re-download.
        tracing::info!(
            "[mounts] Cached {} ({}) has SHA256 {} but task requires {} - evicting",
            cache_key,
            file,
            sha256,
            required_sha256
        );
        with_file_caches(|fc| {
            if let Err(e) = Cache::evict(&cache_key, fc) {
                tracing::error!("[mounts] Failed to evict cache {}: {}", cache_key, e);
            }
        });
    }

    // Download the content.
    let (file, sha256) = content.download(downloads_dir, root_url)?;

    // Insert into file cache.
    with_file_caches(|fc| {
        fc.insert(
            cache_key.clone(),
            Cache {
                created: Utc::now(),
                location: file.clone(),
                hits: 1,
                key: cache_key.clone(),
                sha256: sha256.clone(),
                owner_username: String::new(),
                owner_uid: String::new(),
            },
        );
    });

    // Verify SHA256 if required.
    if required_sha256.is_empty() {
        tracing::warn!(
            "[mounts] Download {} of {} has SHA256 {} but task does not declare a required value",
            file,
            content.description(),
            sha256
        );
        return Ok(file);
    }
    if required_sha256 != sha256 {
        // Evict the bad download.
        with_file_caches(|fc| {
            let _ = Cache::evict(&cache_key, fc);
        });
        anyhow::bail!(
            "Download {} of {} has SHA256 {} but task requires {}",
            file,
            content.description(),
            sha256,
            required_sha256
        );
    }

    tracing::info!(
        "[mounts] Content from {} ({}) matches required SHA256 {}",
        content.description(),
        file,
        sha256
    );
    Ok(file)
}

// ---------------------------------------------------------------------------
// Extract and decompress helpers
// ---------------------------------------------------------------------------

/// Download content, cache it, and extract the archive into a directory.
fn extract_to_dir(
    content: &ContentSource,
    format: &str,
    dir: &Path,
    downloads_dir: &str,
    root_url: &str,
    task_dir: &Path,
) -> anyhow::Result<()> {
    let cache_file = ensure_cached(content, downloads_dir, root_url)?;

    // Create destination directory.
    fs::create_dir_all(dir)?;

    // Copy the cached file to the task directory for extraction, so the
    // original cache file is not modified.
    let copy_to_path = task_dir.join(
        Path::new(&cache_file)
            .file_name()
            .unwrap_or_else(|| std::ffi::OsStr::new("archive")),
    );
    tracing::info!(
        "[mounts] Copying {} to {}",
        cache_file,
        copy_to_path.display()
    );
    fileutil::copy_file(Path::new(&cache_file), &copy_to_path)?;

    // Extract the archive.
    let archive_format = fileutil::ArchiveFormat::from_str(format)?;
    tracing::info!(
        "[mounts] Extracting {} file {} to {}",
        format,
        copy_to_path.display(),
        dir.display()
    );
    let result = fileutil::unarchive(&copy_to_path, dir, archive_format);

    // Clean up the temporary copy regardless of extraction result.
    if let Err(e) = fs::remove_file(&copy_to_path) {
        tracing::warn!(
            "[mounts] Failed to remove temporary file {}: {}",
            copy_to_path.display(),
            e
        );
    }

    result
}

/// Download content, cache it, and decompress/copy to a destination file.
fn decompress_to_file(
    content: &ContentSource,
    format: &str,
    file: &Path,
    downloads_dir: &str,
    root_url: &str,
) -> anyhow::Result<()> {
    let cache_file = ensure_cached(content, downloads_dir, root_url)?;

    // Ensure parent directory exists.
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent)?;
    }

    if format.is_empty() {
        // No compression - just copy the file.
        tracing::info!(
            "[mounts] Copying {} to {}",
            cache_file,
            file.display()
        );
        fileutil::copy_file(Path::new(&cache_file), file)?;
        return Ok(());
    }

    // Try as a decompression format.
    if let Some(decompress_fmt) = fileutil::DecompressFormat::from_str(format) {
        tracing::info!(
            "[mounts] Decompressing {} file {} to {}",
            format,
            cache_file,
            file.display()
        );
        fileutil::decompress_file(Path::new(&cache_file), file, decompress_fmt)?;
        return Ok(());
    }

    anyhow::bail!("unsupported decompression format: {}", format)
}

// ---------------------------------------------------------------------------
// Rename cross-device (move with fallback to copy+delete)
// ---------------------------------------------------------------------------

fn rename_cross_device(src: &Path, dst: &Path) -> anyhow::Result<()> {
    match fs::rename(src, dst) {
        Ok(()) => Ok(()),
        Err(_) => {
            // Rename failed (possibly cross-device). Fall back to recursive copy.
            if src.is_dir() {
                copy_dir_recursive(src, dst)?;
                fs::remove_dir_all(src)?;
            } else {
                fileutil::copy_file(src, dst)?;
                fs::remove_file(src)?;
            }
            Ok(())
        }
    }
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> anyhow::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if file_type.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fileutil::copy_file(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Parsed mount entry types
// ---------------------------------------------------------------------------

/// Parsed mount entry.
#[derive(Debug)]
enum MountEntry {
    FileMount {
        content: ContentSource,
        file: String,
        format: String,
    },
    WritableDirectoryCache {
        cache_name: String,
        content: Option<ContentSource>,
        directory: String,
        format: String,
    },
    ReadOnlyDirectory {
        content: ContentSource,
        directory: String,
        format: String,
    },
}

fn parse_mounts(raw_mounts: &[serde_json::Value]) -> Vec<MountEntry> {
    let mut mounts = Vec::new();

    for raw in raw_mounts {
        if let Some(file) = raw.get("file").and_then(|v| v.as_str()) {
            // FileMount
            let content = raw
                .get("content")
                .and_then(ContentSource::from_json)
                .unwrap_or(ContentSource::Raw {
                    raw: String::new(),
                    sha256: String::new(),
                });
            mounts.push(MountEntry::FileMount {
                content,
                file: file.to_string(),
                format: raw
                    .get("format")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            });
        } else if let Some(cache_name) = raw.get("cacheName").and_then(|v| v.as_str()) {
            // WritableDirectoryCache
            let content = raw.get("content").and_then(ContentSource::from_json);
            mounts.push(MountEntry::WritableDirectoryCache {
                cache_name: cache_name.to_string(),
                content,
                directory: raw
                    .get("directory")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                format: raw
                    .get("format")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            });
        } else if raw.get("directory").is_some() {
            // ReadOnlyDirectory
            let content = raw
                .get("content")
                .and_then(ContentSource::from_json)
                .unwrap_or(ContentSource::Raw {
                    raw: String::new(),
                    sha256: String::new(),
                });
            mounts.push(MountEntry::ReadOnlyDirectory {
                content,
                directory: raw
                    .get("directory")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
                format: raw
                    .get("format")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string(),
            });
        }
    }

    mounts
}

// ---------------------------------------------------------------------------
// Feature implementation
// ---------------------------------------------------------------------------

pub struct MountsFeature;

impl MountsFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for MountsFeature {
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()> {
        // Load persistent cache state from JSON files stored in the caches directory.
        let file_caches_state = Path::new(&config.caches_dir)
            .join("file-caches.json")
            .display()
            .to_string();
        let dir_caches_state = Path::new(&config.caches_dir)
            .join("directory-caches.json")
            .display()
            .to_string();
        let fc = load_cache_map(&file_caches_state, &config.caches_dir);
        let dc = load_cache_map(&dir_caches_state, &config.downloads_dir);

        *FILE_CACHES.lock().expect("file caches lock poisoned") = Some(fc);
        *DIRECTORY_CACHES.lock().expect("directory caches lock poisoned") = Some(dc);

        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_mounts
    }

    fn is_requested(&self, _task: &TaskRun) -> bool {
        // Mounts are always requested if the feature is enabled.
        // Having mounts in the payload is enough; scopes are per-mount.
        true
    }

    fn new_task_feature(&self, task: &TaskRun, config: &Config) -> Box<dyn TaskFeature> {
        let mounts = parse_mounts(&task.payload.mounts);
        Box::new(MountsTaskFeature {
            mounts,
            raw_mounts: task.payload.mounts.clone(),
            mounted: Vec::new(),
            task_dir: task.task_dir.clone(),
            root_url: task.root_url.clone(),
            caches_dir: config.caches_dir.clone(),
            downloads_dir: config.downloads_dir.clone(),
            task_scopes: task.definition.scopes.clone(),
            task_dependencies: task.definition.dependencies.clone(),
        })
    }

    fn name(&self) -> &'static str {
        "Mounts"
    }
}

// ---------------------------------------------------------------------------
// Per-task feature implementation
// ---------------------------------------------------------------------------

struct MountsTaskFeature {
    mounts: Vec<MountEntry>,
    raw_mounts: Vec<serde_json::Value>,
    mounted: Vec<usize>,
    task_dir: PathBuf,
    root_url: String,
    caches_dir: String,
    downloads_dir: String,
    task_scopes: Vec<String>,
    task_dependencies: Vec<String>,
}

impl MountsTaskFeature {
    /// Check the purge cache service and evict any caches that need purging.
    fn purge_caches(&self, provisioner_id: &str, worker_type: &str) {
        // Only query if we have writable caches or haven't queried in 6 hours.
        let has_writable_caches = self.mounts.iter().any(|m| {
            matches!(m, MountEntry::WritableDirectoryCache { .. })
        });

        let should_query = {
            let guard = LAST_PURGE_CACHE_QUERY.lock().expect("purge cache lock poisoned");
            match *guard {
                None => true,
                Some(last) => {
                    has_writable_caches
                        || Utc::now()
                            .signed_duration_since(last)
                            .num_hours()
                            >= 6
                }
            }
        };

        if !should_query {
            return;
        }

        let since = {
            let guard = LAST_PURGE_CACHE_QUERY.lock().expect("purge cache lock poisoned");
            guard.map(|t| t - chrono::Duration::minutes(5))
        };

        // Update last query time.
        {
            let mut guard = LAST_PURGE_CACHE_QUERY.lock().expect("purge cache lock poisoned");
            *guard = Some(Utc::now());
        }

        // Query the purge cache service.
        let worker_pool_id = format!("{}/{}", provisioner_id, worker_type);
        let mut url = format!(
            "{}/api/purge-cache/v1/purge-cache/{}",
            self.root_url, worker_pool_id
        );
        if let Some(since_time) = since {
            url = format!("{}?since={}", url, since_time.to_rfc3339());
        }

        match reqwest::blocking::get(&url) {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.json::<serde_json::Value>() {
                    if let Some(requests) = body.get("requests").and_then(|v| v.as_array()) {
                        for request in requests {
                            let cache_name = request
                                .get("cacheName")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default();
                            let before_str = request
                                .get("before")
                                .and_then(|v| v.as_str())
                                .unwrap_or_default();

                            if cache_name.is_empty() || before_str.is_empty() {
                                continue;
                            }

                            let before = match DateTime::parse_from_rfc3339(before_str) {
                                Ok(dt) => dt.with_timezone(&Utc),
                                Err(_) => continue,
                            };

                            with_directory_caches(|dc| {
                                if let Some(cache) = dc.get(cache_name) {
                                    let cache_created_minus_5 =
                                        cache.created - chrono::Duration::minutes(5);
                                    if cache_created_minus_5 < before {
                                        tracing::info!(
                                            "[mounts] Purging cache {} (created {}, purge before {})",
                                            cache_name,
                                            cache.created,
                                            before
                                        );
                                        if let Err(e) =
                                            Cache::evict(cache_name, dc)
                                        {
                                            tracing::error!(
                                                "[mounts] Failed to evict cache {}: {}",
                                                cache_name,
                                                e
                                            );
                                        }
                                    }
                                }
                            });
                        }
                    }
                }
            }
            Ok(resp) => {
                tracing::warn!(
                    "[mounts] Purge cache service returned {}: could not check for cache purges",
                    resp.status()
                );
            }
            Err(e) => {
                tracing::warn!(
                    "[mounts] Could not reach purge cache service: {}",
                    e
                );
            }
        }
    }

    /// Mount a WritableDirectoryCache.
    fn mount_writable_cache(
        &self,
        cache_name: &str,
        content: &Option<ContentSource>,
        directory: &str,
        format: &str,
    ) -> Result<(), anyhow::Error> {
        let target = self.task_dir.join(directory);

        let existing = with_directory_caches(|dc| {
            dc.get(cache_name).map(|c| (c.location.clone(), c.hits))
        });

        if let Some((src_location, hits)) = existing {
            // Existing cache - bump hits and move into place.
            with_directory_caches(|dc| {
                if let Some(entry) = dc.get_mut(cache_name) {
                    entry.hits = hits + 1;
                }
            });

            let src = Path::new(&src_location);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent)?;
            }

            tracing::info!(
                "[mounts] Moving existing writable directory cache {} from {} to {}",
                cache_name,
                src_location,
                target.display()
            );
            rename_cross_device(src, &target)?;
        } else {
            // New cache - initialise it.
            let basename = generate_slug();
            let cache_location = PathBuf::from(&self.caches_dir).join(&basename);
            let cache_location_str = cache_location.display().to_string();

            tracing::info!(
                "[mounts] No existing writable directory cache '{}' - creating {}",
                cache_name,
                cache_location_str
            );

            // Get current user info for ownership tracking.
            let (username, uid) = get_current_user_info();

            with_directory_caches(|dc| {
                dc.insert(
                    cache_name.to_string(),
                    Cache {
                        hits: 1,
                        created: Utc::now(),
                        location: cache_location_str.clone(),
                        key: cache_name.to_string(),
                        sha256: String::new(),
                        owner_username: username,
                        owner_uid: uid,
                    },
                );
            });

            // Preloaded content?
            if let Some(c) = content {
                extract_to_dir(
                    c,
                    format,
                    &target,
                    &self.downloads_dir,
                    &self.root_url,
                    &self.task_dir,
                )?;
            } else {
                // No preloaded content - just create the directory.
                fs::create_dir_all(&target)?;
            }
        }

        tracing::info!(
            "[mounts] Successfully mounted writable directory cache '{}'",
            target.display()
        );
        Ok(())
    }

    /// Unmount a WritableDirectoryCache (move it back to the cache directory).
    fn unmount_writable_cache(
        &self,
        cache_name: &str,
        directory: &str,
    ) -> Result<(), anyhow::Error> {
        let cache_location = with_directory_caches(|dc| {
            dc.get(cache_name).map(|c| c.location.clone())
        });

        let cache_dir = match cache_location {
            Some(loc) => loc,
            None => {
                tracing::warn!(
                    "[mounts] Cache {} not found in directory caches during unmount",
                    cache_name
                );
                return Ok(());
            }
        };

        let task_cache_dir = self.task_dir.join(directory);

        tracing::info!(
            "[mounts] Preserving cache: Moving {} to {}",
            task_cache_dir.display(),
            cache_dir
        );

        if let Err(e) = rename_cross_device(&task_cache_dir, Path::new(&cache_dir)) {
            // Failed to preserve cache. Evict it and report as failure.
            tracing::error!(
                "[mounts] Could not persist cache {} from {} to {}: {}",
                cache_name,
                task_cache_dir.display(),
                cache_dir,
                e
            );
            with_directory_caches(|dc| {
                if let Err(evict_err) = Cache::evict(cache_name, dc) {
                    tracing::error!(
                        "[mounts] Failed to evict cache {} after move failure: {}",
                        cache_name,
                        evict_err
                    );
                }
            });
            anyhow::bail!("could not persist cache {} due to {}", cache_name, e);
        }

        Ok(())
    }

    /// Mount a ReadOnlyDirectory.
    fn mount_read_only_dir(
        &self,
        content: &ContentSource,
        directory: &str,
        format: &str,
    ) -> Result<(), anyhow::Error> {
        let dir = self.task_dir.join(directory);
        extract_to_dir(
            content,
            format,
            &dir,
            &self.downloads_dir,
            &self.root_url,
            &self.task_dir,
        )?;
        tracing::info!(
            "[mounts] Successfully mounted read-only directory {}",
            dir.display()
        );
        Ok(())
    }

    /// Mount a FileMount.
    fn mount_file(
        &self,
        content: &ContentSource,
        file_path: &str,
        format: &str,
    ) -> Result<(), anyhow::Error> {
        let file = self.task_dir.join(file_path);

        // Check if a directory already exists at the target path.
        if file.exists() && file.is_dir() {
            anyhow::bail!(
                "cannot mount file at path {} since it already exists as a directory",
                file.display()
            );
        }

        decompress_to_file(content, format, &file, &self.downloads_dir, &self.root_url)?;

        tracing::info!("[mounts] Successfully mounted file {}", file.display());
        Ok(())
    }
}

/// Get the current user's username and UID.
fn get_current_user_info() -> (String, String) {
    #[cfg(unix)]
    {
        use std::ffi::CStr;
        unsafe {
            let uid = libc::getuid();
            let pw = libc::getpwuid(uid);
            if !pw.is_null() {
                let username = CStr::from_ptr((*pw).pw_name)
                    .to_str()
                    .unwrap_or("unknown")
                    .to_string();
                return (username, uid.to_string());
            }
            ("unknown".to_string(), uid.to_string())
        }
    }
    #[cfg(not(unix))]
    {
        // On Windows, we don't track UID the same way.
        (
            std::env::var("USERNAME").unwrap_or_else(|_| "unknown".to_string()),
            String::new(),
        )
    }
}

/// Check whether the given task scopes satisfy a required scope.
/// Supports simple glob matching with '*' at the end.
fn scope_matches(task_scopes: &[String], required: &str) -> bool {
    for scope in task_scopes {
        if scope == required {
            return true;
        }
        // Support trailing wildcard: "generic-worker:cache:*" matches any cache.
        if scope.ends_with('*') {
            let prefix = &scope[..scope.len() - 1];
            if required.starts_with(prefix) {
                return true;
            }
        }
    }
    false
}

/// Known valid keys for each content source type in mount content objects.
const VALID_CONTENT_KEYS: &[&[&str]] = &[
    // ArtifactContent: taskId, artifact, sha256
    &["taskId", "artifact", "sha256"],
    // IndexedContent: namespace, artifact
    &["namespace", "artifact"],
    // URLContent: url, sha256
    &["url", "sha256"],
    // RawContent: raw, sha256
    &["raw", "sha256"],
    // Base64Content: base64, sha256
    &["base64", "sha256"],
];

/// Validate mount content objects for unexpected keys.
/// Returns a malformed-payload error if an unexpected key is found.
fn validate_mount_content_fields(
    raw_mounts: &[serde_json::Value],
) -> Option<CommandExecutionError> {
    for raw in raw_mounts {
        let content = match raw.get("content") {
            Some(c) if c.is_object() => c,
            _ => continue,
        };
        let content_obj = content.as_object().unwrap();
        let content_keys: Vec<&str> = content_obj.keys().map(|k| k.as_str()).collect();

        // Determine which content type this is by checking for the discriminator key.
        let valid_keys: Option<&[&str]> = if content_obj.contains_key("taskId") {
            Some(VALID_CONTENT_KEYS[0])
        } else if content_obj.contains_key("namespace") {
            Some(VALID_CONTENT_KEYS[1])
        } else if content_obj.contains_key("url") {
            Some(VALID_CONTENT_KEYS[2])
        } else if content_obj.contains_key("raw") {
            Some(VALID_CONTENT_KEYS[3])
        } else if content_obj.contains_key("base64") {
            Some(VALID_CONTENT_KEYS[4])
        } else {
            None
        };

        if let Some(valid) = valid_keys {
            for key in &content_keys {
                if !valid.contains(key) {
                    return Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                        "mount content object contains unexpected key '{}'; valid keys for this content type are: {}",
                        key,
                        valid.join(", "),
                    )));
                }
            }
        } else {
            // No recognisable content type -- check all valid keys across all types.
            let all_valid: std::collections::HashSet<&str> =
                VALID_CONTENT_KEYS.iter().flat_map(|ks| ks.iter().copied()).collect();
            for key in &content_keys {
                if !all_valid.contains(key) {
                    return Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                        "mount content object contains unexpected key '{}'; not a valid content key",
                        key,
                    )));
                }
            }
        }
    }
    None
}

impl TaskFeature for MountsTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        let mut scopes = Vec::new();
        for mount in &self.mounts {
            if let MountEntry::WritableDirectoryCache { cache_name, .. } = mount {
                scopes.push(vec![format!("generic-worker:cache:{}", cache_name)]);
            }
        }
        scopes
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        // Validate mount content objects for unexpected keys.
        if let Some(err) = validate_mount_content_fields(&self.raw_mounts) {
            return Some(err);
        }

        // Validate scopes: each writable directory cache requires
        // generic-worker:cache:{cacheName}.
        for mount in &self.mounts {
            if let MountEntry::WritableDirectoryCache { cache_name, .. } = mount {
                let required_scope = format!("generic-worker:cache:{}", cache_name);
                if !scope_matches(&self.task_scopes, &required_scope) {
                    return Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                        "task.scopes is missing required scope {} for cache {}",
                        required_scope,
                        cache_name,
                    )));
                }
            }
        }

        // Validate dependencies: any ArtifactContent with a taskId must have
        // that taskId in task.dependencies.
        for mount in &self.mounts {
            let deps = match mount {
                MountEntry::FileMount { content, .. } => content.task_dependencies(),
                MountEntry::WritableDirectoryCache {
                    content: Some(content),
                    ..
                } => content.task_dependencies(),
                MountEntry::ReadOnlyDirectory { content, .. } => content.task_dependencies(),
                _ => vec![],
            };
            for dep_task_id in &deps {
                if !self.task_dependencies.contains(dep_task_id) {
                    return Some(crate::errors::malformed_payload_error(anyhow::anyhow!(
                        "task.dependencies needs to include {} since one or more of task.payload.mounts references artifacts from it",
                        dep_task_id,
                    )));
                }
            }
        }

        // Ensure downloads directory exists.
        if let Err(e) = fs::create_dir_all(&self.downloads_dir) {
            tracing::error!(
                "[mounts] Cannot create downloads directory {}: {}",
                self.downloads_dir,
                e
            );
            return Some(crate::errors::internal_error(e));
        }

        // Use block_in_place to allow blocking HTTP calls (reqwest::blocking)
        // within the tokio runtime. The purge_caches, download, and mount
        // operations all use synchronous HTTP.
        tokio::task::block_in_place(|| {
            // Check purge cache service (optimistic strategy: if unreachable, don't purge).
            // TODO: Pass actual provisioner_id and worker_type from Config.
            self.purge_caches("", "");

            // Mount each entry.
            for i in 0..self.mounts.len() {
                let result = match &self.mounts[i] {
                    MountEntry::FileMount {
                        content,
                        file,
                        format,
                    } => {
                        let content = content.clone();
                        let file = file.clone();
                        let format = format.clone();
                        self.mount_file(&content, &file, &format)
                    }
                    MountEntry::WritableDirectoryCache {
                        cache_name,
                        content,
                        directory,
                        format,
                    } => {
                        let cache_name = cache_name.clone();
                        let content = content.clone();
                        let directory = directory.clone();
                        let format = format.clone();
                        self.mount_writable_cache(&cache_name, &content, &directory, &format)
                    }
                    MountEntry::ReadOnlyDirectory {
                        content,
                        directory,
                        format,
                    } => {
                        let content = content.clone();
                        let directory = directory.clone();
                        let format = format.clone();
                        self.mount_read_only_dir(&content, &directory, &format)
                    }
                };

                if let Err(e) = result {
                    tracing::error!("[mounts] Mount failed: {}", e);
                    return Some(crate::errors::failure(anyhow::anyhow!("[mounts] {}", e)));
                }
                self.mounted.push(i);
            }

            None
        })
    }

    fn stop(&mut self, errors: &mut ExecutionErrors, ctx: &super::StopContext) {
        // Check if the exit code matches any purgeCaches exit codes.
        let should_purge = ctx.purge_caches_exit_codes.contains(&(ctx.last_exit_code as i64));

        // Unmount in reverse order.
        let mounted_indices: Vec<usize> = self.mounted.iter().rev().copied().collect();
        for i in mounted_indices {
            if let Some(mount) = self.mounts.get(i) {
                match mount {
                    MountEntry::WritableDirectoryCache {
                        cache_name,
                        directory,
                        ..
                    } => {
                        let cache_name = cache_name.clone();
                        let directory = directory.clone();
                        if should_purge {
                            // Purge the cache instead of preserving it.
                            tracing::info!(
                                "[mounts] Purging cache {} (exit code {} matches purgeCaches)",
                                cache_name,
                                ctx.last_exit_code,
                            );
                            // Remove the task cache directory.
                            let task_cache_dir = self.task_dir.join(&directory);
                            if task_cache_dir.exists() {
                                if let Err(e) = fs::remove_dir_all(&task_cache_dir) {
                                    tracing::error!(
                                        "[mounts] Failed to remove task cache dir {}: {}",
                                        task_cache_dir.display(),
                                        e
                                    );
                                }
                            }
                            // Evict the cache from the persistent store.
                            with_directory_caches(|dc| {
                                if let Err(e) = Cache::evict(&cache_name, dc) {
                                    tracing::error!(
                                        "[mounts] Failed to evict cache {}: {}",
                                        cache_name,
                                        e
                                    );
                                }
                            });
                        } else {
                            if let Err(e) = self.unmount_writable_cache(&cache_name, &directory) {
                                tracing::error!("[mounts] Unmount error for cache {}: {}", cache_name, e);
                                errors.add(crate::errors::failure(e));
                            }
                        }
                    }
                    MountEntry::ReadOnlyDirectory { directory, .. } => {
                        // Nothing to do for read-only directories - the task dir cleanup
                        // will remove them.
                        tracing::info!("[mounts] Unmounting read-only directory: {}", directory);
                    }
                    MountEntry::FileMount { file, .. } => {
                        // Nothing to do for file mounts - the task dir cleanup
                        // will remove them.
                        tracing::info!("[mounts] Unmounting file: {}", file);
                    }
                }
            }
        }

        // Persist cache state to JSON files in the caches directory.
        let file_caches_state = Path::new(&self.caches_dir)
            .join("file-caches.json")
            .display()
            .to_string();
        let dir_caches_state = Path::new(&self.caches_dir)
            .join("directory-caches.json")
            .display()
            .to_string();

        let save_file_err = with_file_caches(|fc| save_cache_map(fc, &file_caches_state));
        if let Err(e) = save_file_err {
            tracing::error!("[mounts] Failed to save {}: {}", file_caches_state, e);
            errors.add(crate::errors::internal_error(e));
        }

        let save_dir_err =
            with_directory_caches(|dc| save_cache_map(dc, &dir_caches_state));
        if let Err(e) = save_dir_err {
            tracing::error!("[mounts] Failed to save {}: {}", dir_caches_state, e);
            errors.add(crate::errors::internal_error(e));
        }

        // Secure the cache state files.
        if let Err(e) =
            fileutil::secure_files(&[file_caches_state.as_str(), dir_caches_state.as_str()])
        {
            tracing::error!("[mounts] Failed to secure cache state files: {}", e);
            errors.add(crate::errors::internal_error(e));
        }
    }
}
