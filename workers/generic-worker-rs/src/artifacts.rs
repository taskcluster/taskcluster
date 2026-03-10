//! Artifact types and upload logic.
//!
//! Handles discovering, uploading, and managing task artifacts.

use anyhow::Result;
use chrono::{DateTime, Utc};
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::config::Config;
use crate::tc;

/// Base artifact metadata shared by all artifact types.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BaseArtifact {
    pub name: String,
    pub expires: DateTime<Utc>,
    #[serde(default)]
    pub optional: bool,
}

/// Enum-based artifact type for dyn compatibility.
#[derive(Debug, Clone)]
pub enum Artifact {
    Object(ObjectArtifact),
    S3(S3Artifact),
    Error(ErrorArtifact),
    Link(LinkArtifact),
    Redirect(RedirectArtifact),
}

impl Artifact {
    pub fn base(&self) -> &BaseArtifact {
        match self {
            Self::Object(a) => &a.base,
            Self::S3(a) => &a.base,
            Self::Error(a) => &a.base,
            Self::Link(a) => &a.base,
            Self::Redirect(a) => &a.base,
        }
    }

    pub fn request_object(&self) -> serde_json::Value {
        match self {
            Self::Object(a) => serde_json::json!({
                "storageType": "object",
                "contentType": a.content_type,
                "expires": a.base.expires.to_rfc3339(),
            }),
            Self::S3(a) => serde_json::json!({
                "storageType": "s3",
                "contentType": a.content_type,
                "contentLength": a.content_length,
                "expires": a.base.expires.to_rfc3339(),
            }),
            Self::Error(a) => serde_json::json!({
                "storageType": "error",
                "expires": a.base.expires.to_rfc3339(),
                "reason": a.reason,
                "message": a.message,
            }),
            Self::Link(a) => serde_json::json!({
                "storageType": "link",
                "expires": a.base.expires.to_rfc3339(),
                "contentType": a.content_type,
                "artifact": a.artifact,
            }),
            Self::Redirect(a) => serde_json::json!({
                "storageType": "reference",
                "expires": a.base.expires.to_rfc3339(),
                "contentType": a.content_type,
                "url": a.url,
            }),
        }
    }

    pub async fn process_response(
        &self,
        response: &serde_json::Value,
        _config: &Config,
    ) -> Result<()> {
        match self {
            Self::Object(a) => {
                if let Some(put_url) = response.get("putUrl").and_then(|v| v.as_str()) {
                    let content = tokio::fs::read(&a.path).await?;
                    let client = reqwest::Client::new();
                    let mut req = client.put(put_url).body(content);

                    if !a.content_type.is_empty() {
                        req = req.header("Content-Type", &a.content_type);
                    }
                    if !a.content_encoding.is_empty() {
                        req = req.header("Content-Encoding", &a.content_encoding);
                    }

                    let resp = req.send().await?;
                    if !resp.status().is_success() {
                        anyhow::bail!(
                            "Failed to upload artifact {}: HTTP {}",
                            a.base.name,
                            resp.status()
                        );
                    }
                }
                Ok(())
            }
            Self::S3(a) => {
                if let Some(put_url) = response.get("putUrl").and_then(|v| v.as_str()) {
                    a.process_s3_response(put_url).await?;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    pub fn finish_request(&self) -> serde_json::Value {
        serde_json::json!({})
    }

    pub fn display(&self) -> String {
        match self {
            Self::Object(a) => format!(
                "ObjectArtifact({}, path={}, type={})",
                a.base.name,
                a.path.display(),
                a.content_type,
            ),
            Self::S3(a) => format!(
                "S3 Artifact - Name: '{}', Path: '{}', Expires: {}, Content Encoding: '{}', MIME Type: '{}', Content Length: '{}'",
                a.base.name,
                a.path.display(),
                a.base.expires,
                a.content_encoding,
                a.content_type,
                a.content_length,
            ),
            Self::Error(a) => {
                format!("ErrorArtifact({}, reason={})", a.base.name, a.reason)
            }
            Self::Link(a) => {
                format!("LinkArtifact({} -> {})", a.base.name, a.artifact)
            }
            Self::Redirect(a) => {
                format!("RedirectArtifact({} -> {})", a.base.name, a.url)
            }
        }
    }
}

/// An object artifact (file uploaded to object storage).
#[derive(Debug, Clone)]
pub struct ObjectArtifact {
    pub base: BaseArtifact,
    pub path: PathBuf,
    pub content_type: String,
    pub content_encoding: String,
}

impl ObjectArtifact {
    pub fn new(
        name: String,
        path: PathBuf,
        content_type: String,
        content_encoding: String,
        expires: DateTime<Utc>,
        optional: bool,
    ) -> Self {
        Self {
            base: BaseArtifact {
                name,
                expires,
                optional,
            },
            path,
            content_type,
            content_encoding,
        }
    }
}

/// An S3 artifact (file uploaded to S3 storage).
///
/// Ported from Go `artifacts/s3.go`. S3Artifact supports optional gzip
/// compression of the content before uploading.
#[derive(Debug, Clone)]
pub struct S3Artifact {
    pub base: BaseArtifact,
    /// Path is the filename of the file declared in the task payload.
    pub path: PathBuf,
    /// ContentPath is the filename of the file containing the data
    /// for this artifact. ContentPath may be equal to path, or,
    /// in the case where a temporary file is created, it may be different.
    pub content_path: PathBuf,
    pub content_encoding: String,
    pub content_type: String,
    /// ContentLength is the original file size in bytes, before any
    /// encoding (e.g. gzip). Sent to the queue for monitoring purposes.
    pub content_length: i64,
}

impl S3Artifact {
    pub fn new(
        name: String,
        path: PathBuf,
        content_path: PathBuf,
        content_type: String,
        content_encoding: String,
        content_length: i64,
        expires: DateTime<Utc>,
    ) -> Self {
        Self {
            base: BaseArtifact {
                name,
                expires,
                optional: false,
            },
            path,
            content_path,
            content_type,
            content_encoding,
            content_length,
        }
    }

    /// Gzip-compress the file at content_path and write it to a temporary
    /// file. Returns the path of the generated temporary file. The caller
    /// is responsible for deleting the temporary file.
    fn create_temp_file_for_put_body(&self) -> Result<PathBuf> {
        let base_name = self
            .path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy();

        let mut tmp_file = tempfile::Builder::new()
            .prefix(&*base_name)
            .tempfile()?;

        let source_data = std::fs::read(&self.content_path)?;

        if self.content_encoding == "gzip" {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
            encoder.write_all(&source_data)?;
            let compressed = encoder.finish()?;
            tmp_file.write_all(&compressed)?;
        } else {
            tmp_file.write_all(&source_data)?;
        }

        // Persist the temp file so it isn't deleted when tmp_file is dropped
        let (_, path) = tmp_file.keep()?;
        Ok(path)
    }

    /// Process the S3 artifact response by uploading the content to the
    /// given PUT URL with retries for transient errors.
    async fn process_s3_response(&self, put_url: &str) -> Result<()> {
        tracing::info!(
            "Uploading artifact {} from file {} with content encoding {:?}, mime type {:?} and expiry {}",
            self.base.name,
            self.path.display(),
            self.content_encoding,
            self.content_type,
            self.base.expires,
        );

        // Determine whether a temp file was already created (trusted vs untrusted).
        let temp_file_created = self.path != self.content_path;
        let cleanup_content_path = temp_file_created;

        // Create a transfer file: either gzip-compress or copy to a temp file.
        let transfer_content_file = if !temp_file_created || self.content_encoding == "gzip" {
            tracing::info!("Copying {} to temp file...", self.content_path.display());
            self.create_temp_file_for_put_body()?
        } else {
            tracing::info!(
                "Not copying {} to temp file",
                self.content_path.display()
            );
            self.content_path.clone()
        };

        // Clean up the content path if it was a temp file created by the caller
        let _content_cleanup = if cleanup_content_path {
            Some(scopeguard::guard(self.content_path.clone(), |p| {
                let _ = std::fs::remove_file(&p);
            }))
        } else {
            None
        };

        // Clean up the transfer file if it differs from content_path
        let needs_transfer_cleanup = transfer_content_file != self.content_path;
        let _transfer_cleanup = if needs_transfer_cleanup {
            Some(scopeguard::guard(transfer_content_file.clone(), |p| {
                let _ = std::fs::remove_file(&p);
            }))
        } else {
            None
        };

        // Perform HTTP PUT with retries
        let client = reqwest::Client::new();
        let content_encoding = self.content_encoding.clone();
        let content_type_from_response = self.content_type.clone();
        let artifact_name = self.base.name.clone();

        let mut last_error: Option<anyhow::Error> = None;
        let max_attempts = 5;

        for attempt in 1..=max_attempts {
            let transfer_content = tokio::fs::read(&transfer_content_file).await?;
            let transfer_content_length = transfer_content.len();

            let mut req = client
                .put(put_url)
                .header("Content-Type", &content_type_from_response)
                .body(transfer_content);

            if !content_encoding.is_empty() {
                req = req.header("Content-Encoding", &content_encoding);
            }
            req = req.header("Content-Length", transfer_content_length.to_string());

            match req.send().await {
                Ok(resp) => {
                    let status = resp.status();
                    // S3 incorrectly returns HTTP 400 for connection inactivity,
                    // which can/should be retried (see bug 1394557).
                    if status == reqwest::StatusCode::BAD_REQUEST {
                        last_error = Some(anyhow::anyhow!(
                            "S3 returned status code 400 which could be an intermittent issue - see https://bugzilla.mozilla.org/show_bug.cgi?id=1394557"
                        ));
                        tracing::warn!(
                            "Attempt {}/{}: S3 returned 400, retrying...",
                            attempt,
                            max_attempts
                        );
                        continue;
                    }
                    if !status.is_success() {
                        let body = resp.text().await.unwrap_or_default();
                        anyhow::bail!(
                            "Failed to upload artifact {}: HTTP {} - {}",
                            artifact_name,
                            status,
                            body
                        );
                    }

                    // Redact query string for logging
                    if let Ok(parsed) = url::Url::parse(put_url) {
                        tracing::info!(
                            "{} put requests issued to {}://{}{}?<redacted>",
                            attempt,
                            parsed.scheme(),
                            parsed.host_str().unwrap_or(""),
                            parsed.path()
                        );
                    }
                    return Ok(());
                }
                Err(e) => {
                    last_error = Some(e.into());
                    tracing::warn!(
                        "Attempt {}/{}: PUT request failed, retrying...",
                        attempt,
                        max_attempts
                    );
                }
            }
        }

        Err(last_error.unwrap_or_else(|| anyhow::anyhow!("S3 upload failed after all retries")))
    }
}

/// An error artifact (records that an artifact could not be created).
#[derive(Debug, Clone)]
pub struct ErrorArtifact {
    pub base: BaseArtifact,
    pub message: String,
    pub reason: String,
}

/// A link artifact (references another artifact).
#[derive(Debug, Clone)]
pub struct LinkArtifact {
    pub base: BaseArtifact,
    pub content_type: String,
    pub artifact: String,
}

/// A redirect artifact (redirects to a URL).
#[derive(Debug, Clone)]
pub struct RedirectArtifact {
    pub base: BaseArtifact,
    pub content_type: String,
    pub url: String,
}

/// Upload an artifact to the Queue service.
pub async fn upload_artifact<Q: tc::Queue>(
    queue: &Q,
    task_id: &str,
    run_id: u32,
    artifact: &Artifact,
    config: &Config,
) -> Result<()> {
    let name = &artifact.base().name;

    // Create artifact
    let request = artifact.request_object();
    let response = queue
        .create_artifact(task_id, run_id, name, &request)
        .await?;

    // Process response (upload data if needed)
    artifact.process_response(&response, config).await?;

    // Finish artifact
    let finish_request = artifact.finish_request();
    queue
        .finish_artifact(task_id, run_id, name, &finish_request)
        .await?;

    tracing::info!("Uploaded artifact: {}", artifact.display());
    Ok(())
}

/// Discover artifacts from task payload definitions and the filesystem.
pub fn discover_artifacts(
    task_dir: &Path,
    definitions: &[crate::model::ArtifactDefinition],
    expires: DateTime<Utc>,
) -> Vec<Artifact> {
    let mut artifacts: Vec<Artifact> = Vec::new();

    for def in definitions {
        // If name is not specified, default to the path.
        let name = if def.name.is_empty() {
            &def.path
        } else {
            &def.name
        };
        let full_path = task_dir.join(&def.path);

        if !full_path.exists() {
            if def.optional {
                tracing::info!("Optional artifact not found, skipping: {}", name);
                continue;
            }
            artifacts.push(Artifact::Error(ErrorArtifact {
                base: BaseArtifact {
                    name: name.to_string(),
                    expires,
                    optional: false,
                },
                message: format!("Artifact not found: {}", def.path),
                reason: "file-missing-on-worker".to_string(),
            }));
            continue;
        }

        match def.artifact_type.as_str() {
            "file" => {
                // Check if the path points to a directory instead of a file.
                if full_path.is_dir() {
                    artifacts.push(Artifact::Error(ErrorArtifact {
                        base: BaseArtifact {
                            name: name.to_string(),
                            expires,
                            optional: false,
                        },
                        message: format!(
                            "Artifact '{}' is declared as type 'file' but path '{}' is a directory",
                            name, def.path
                        ),
                        reason: "invalid-resource-on-worker".to_string(),
                    }));
                    continue;
                }

                let content_type = if def.content_type.is_empty() {
                    mime_guess::from_path(&full_path)
                        .first_or_octet_stream()
                        .to_string()
                } else {
                    def.content_type.clone()
                };

                artifacts.push(Artifact::Object(ObjectArtifact::new(
                    name.to_string(),
                    full_path,
                    content_type,
                    def.content_encoding.clone(),
                    def.expires.unwrap_or(expires),
                    def.optional,
                )));
            }
            "directory" => {
                if let Ok(entries) = walkdir::WalkDir::new(&full_path)
                    .into_iter()
                    .collect::<std::result::Result<Vec<_>, _>>()
                {
                    for entry in entries {
                        if entry.file_type().is_file() {
                            let rel_path =
                                entry.path().strip_prefix(&full_path).unwrap_or(entry.path());
                            let entry_name = format!("{}/{}", name, rel_path.display());
                            let content_type = mime_guess::from_path(entry.path())
                                .first_or_octet_stream()
                                .to_string();

                            artifacts.push(Artifact::Object(ObjectArtifact::new(
                                entry_name,
                                entry.path().to_path_buf(),
                                content_type,
                                String::new(),
                                def.expires.unwrap_or(expires),
                                def.optional,
                            )));
                        }
                    }
                }
            }
            _ => {
                tracing::warn!("Unknown artifact type: {}", def.artifact_type);
            }
        }
    }

    artifacts
}
