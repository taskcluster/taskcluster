//! Chain of Trust feature - cryptographic provenance for task artifacts.
//!
//! Produces a signed chain-of-trust document that includes SHA256 hashes
//! of all artifacts, the task definition, and environment metadata. The
//! document is signed with an Ed25519 private key configured on the worker.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use ed25519_dalek::{Signer, SigningKey};
use sha2::{Digest, Sha256};

use crate::config::Config;
use crate::errors::{internal_error, CommandExecutionError, ExecutionErrors};
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

const CERTIFIED_LOG_ARTIFACT: &str = "public/logs/certified.log";
const COT_JSON_ARTIFACT: &str = "public/chain-of-trust.json";
const COT_SIG_ARTIFACT: &str = "public/chain-of-trust.json.sig";

pub struct ChainOfTrustFeature {
    signing_key: Option<SigningKey>,
}

impl ChainOfTrustFeature {
    pub fn new() -> Self {
        Self { signing_key: None }
    }
}

impl Feature for ChainOfTrustFeature {
    fn initialise(&mut self, config: &Config) -> anyhow::Result<()> {
        if !config.enable_chain_of_trust {
            return Ok(());
        }

        let key_path = &config.ed25519_signing_key_location;
        if key_path.is_empty() {
            anyhow::bail!(
                "chain of trust is enabled but ed25519SigningKeyLocation is not configured"
            );
        }

        let key_content = std::fs::read(key_path)
            .map_err(|e| anyhow::anyhow!("failed to read ed25519 signing key at {}: {}", key_path, e))?;

        // The Go generic-worker stores ed25519 keys as base64-encoded seed.
        // We support: base64-encoded text (Go format), raw 32-byte seed, or
        // raw 64-byte keypair (first 32 bytes are the seed).
        let key_bytes = {
            use base64::Engine;
            // Try base64 decode first (Go format: ~44 chars + optional newline)
            let trimmed = String::from_utf8_lossy(&key_content);
            let trimmed = trimmed.trim();
            if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(trimmed) {
                decoded
            } else {
                // Fall back to raw bytes
                key_content
            }
        };

        let signing_key = if key_bytes.len() == 32 {
            SigningKey::from_bytes(
                key_bytes
                    .as_slice()
                    .try_into()
                    .map_err(|_| anyhow::anyhow!("invalid ed25519 key length"))?,
            )
        } else if key_bytes.len() == 64 {
            let seed: [u8; 32] = key_bytes[..32]
                .try_into()
                .map_err(|_| anyhow::anyhow!("invalid ed25519 key length"))?;
            SigningKey::from_bytes(&seed)
        } else {
            anyhow::bail!(
                "ed25519 signing key at {} has unexpected length {} (expected 32 or 64 raw bytes, or base64-encoded seed)",
                key_path,
                key_bytes.len()
            );
        };

        self.signing_key = Some(signing_key);
        tracing::info!("Chain of Trust: loaded Ed25519 signing key from {}", key_path);

        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_chain_of_trust
    }

    fn is_requested(&self, _task: &TaskRun) -> bool {
        // Chain of trust applies to all tasks when enabled at the worker level.
        true
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(ChainOfTrustTaskFeature {
            task_id: task.task_id.clone(),
            run_id: task.run_id,
            task_dir: task.task_dir.clone(),
            task_definition: serde_json::to_value(&task.definition).unwrap_or_default(),
            signing_key: self.signing_key.clone(),
            worker_group: String::new(),
            worker_id: String::new(),
        })
    }

    fn name(&self) -> &'static str {
        "ChainOfTrust"
    }
}

struct ChainOfTrustTaskFeature {
    task_id: String,
    run_id: u32,
    task_dir: PathBuf,
    task_definition: serde_json::Value,
    signing_key: Option<SigningKey>,
    worker_group: String,
    worker_id: String,
}

impl ChainOfTrustTaskFeature {
    /// Compute the SHA256 hash of a file, returning hex-encoded string.
    fn sha256_file(path: &Path) -> anyhow::Result<String> {
        let data = std::fs::read(path)?;
        let mut hasher = Sha256::new();
        hasher.update(&data);
        let result = hasher.finalize();
        Ok(hex::encode(result))
    }

    /// Build the chain-of-trust JSON document.
    fn build_cot_document(
        &self,
        artifact_hashes: &BTreeMap<String, String>,
    ) -> serde_json::Value {
        let environment = serde_json::json!({
            "publicIpAddress": "",
            "privateIpAddress": "",
            "instanceId": "",
            "instanceType": "",
            "availabilityZone": "",
            "region": "",
            "workerGroup": self.worker_group,
            "workerId": self.worker_id,
        });

        serde_json::json!({
            "version": 1,
            "artifacts": artifact_hashes,
            "taskId": self.task_id,
            "runId": self.run_id,
            "task": self.task_definition,
            "environment": environment,
        })
    }
}

impl TaskFeature for ChainOfTrustTaskFeature {
    fn reserved_artifacts(&self) -> Vec<String> {
        vec![
            CERTIFIED_LOG_ARTIFACT.to_string(),
            COT_JSON_ARTIFACT.to_string(),
            COT_SIG_ARTIFACT.to_string(),
        ]
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        // Optionally validate that the task user cannot read the private key.
        // This is a best-effort check; on some platforms it may not be possible.
        tracing::info!("ChainOfTrust feature started for task {}/{}", self.task_id, self.run_id);
        None
    }

    fn stop(&mut self, errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        let signing_key = match &self.signing_key {
            Some(k) => k,
            None => {
                errors.add(internal_error(anyhow::anyhow!(
                    "chain of trust: no signing key available"
                )));
                return;
            }
        };

        // Step 1: Copy task log to certified.log
        let backing_log_path = self.task_dir.join("live_backing.log");
        let certified_log_path = self.task_dir.join("certified.log");
        if backing_log_path.exists() {
            if let Err(e) = std::fs::copy(&backing_log_path, &certified_log_path) {
                errors.add(internal_error(anyhow::anyhow!(
                    "chain of trust: failed to copy log to certified.log: {}",
                    e
                )));
                return;
            }
        } else {
            // Create an empty certified log if backing log doesn't exist
            if let Err(e) = std::fs::write(&certified_log_path, b"") {
                errors.add(internal_error(anyhow::anyhow!(
                    "chain of trust: failed to create certified.log: {}",
                    e
                )));
                return;
            }
        }

        // Step 2: Compute SHA256 of all artifacts in the task directory
        let mut artifact_hashes = BTreeMap::new();

        // Hash the certified log
        match Self::sha256_file(&certified_log_path) {
            Ok(hash) => {
                artifact_hashes.insert(CERTIFIED_LOG_ARTIFACT.to_string(), hash);
            }
            Err(e) => {
                errors.add(internal_error(anyhow::anyhow!(
                    "chain of trust: failed to hash certified.log: {}",
                    e
                )));
                return;
            }
        }

        // Walk the task directory for other artifacts and hash them
        if let Ok(entries) = walkdir::WalkDir::new(&self.task_dir)
            .into_iter()
            .collect::<Result<Vec<_>, _>>()
        {
            for entry in entries {
                if !entry.file_type().is_file() {
                    continue;
                }
                let path = entry.path();
                // Skip the CoT artifacts themselves and the backing log
                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                if file_name == "chain-of-trust.json"
                    || file_name == "chain-of-trust.json.sig"
                    || file_name == "certified.log"
                    || file_name == "live_backing.log"
                {
                    continue;
                }

                if let Ok(rel_path) = path.strip_prefix(&self.task_dir) {
                    let artifact_name = format!("public/{}", rel_path.display());
                    if let Ok(hash) = Self::sha256_file(path) {
                        artifact_hashes.insert(artifact_name, hash);
                    }
                }
            }
        }

        // Step 3: Build the chain-of-trust JSON
        let cot_document = self.build_cot_document(&artifact_hashes);
        let cot_json = match serde_json::to_string_pretty(&cot_document) {
            Ok(j) => j,
            Err(e) => {
                errors.add(internal_error(anyhow::anyhow!(
                    "chain of trust: failed to serialize CoT document: {}",
                    e
                )));
                return;
            }
        };

        // Write the CoT JSON to disk
        let cot_json_path = self.task_dir.join("chain-of-trust.json");
        if let Err(e) = std::fs::write(&cot_json_path, cot_json.as_bytes()) {
            errors.add(internal_error(anyhow::anyhow!(
                "chain of trust: failed to write chain-of-trust.json: {}",
                e
            )));
            return;
        }

        // Step 4: Sign the document with Ed25519
        let signature = signing_key.sign(cot_json.as_bytes());
        let sig_bytes = signature.to_bytes();

        // Write the signature to disk
        let cot_sig_path = self.task_dir.join("chain-of-trust.json.sig");
        if let Err(e) = std::fs::write(&cot_sig_path, sig_bytes) {
            errors.add(internal_error(anyhow::anyhow!(
                "chain of trust: failed to write chain-of-trust.json.sig: {}",
                e
            )));
            return;
        }

        tracing::info!(
            "ChainOfTrust: generated CoT document with {} artifact hashes for task {}/{}",
            artifact_hashes.len(),
            self.task_id,
            self.run_id,
        );

        // TODO: Upload certified.log, chain-of-trust.json, and chain-of-trust.json.sig
        // as artifacts via the Queue API. This requires access to the queue client,
        // which will be wired in when the artifact upload pipeline is integrated
        // into the feature stop phase.
    }
}

/// Hex-encode bytes (avoids adding a separate `hex` crate dependency).
mod hex {
    pub fn encode(bytes: impl AsRef<[u8]>) -> String {
        bytes
            .as_ref()
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect()
    }
}
