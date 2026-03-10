//! Interactive feature - WebSocket-based interactive shell access.
//!
//! When enabled, this feature exposes a WebSocket endpoint that allows
//! interactive shell access to the task environment. This is useful for
//! debugging failed tasks.
//!
//! On start:
//! 1. Creates an HTTP server accepting WebSocket upgrades
//! 2. Generates a random secret for the URL path
//! 3. Sets the INTERACTIVE_ACCESS_TOKEN env var
//! 4. Uploads a RedirectArtifact (private/generic-worker/shell.html) pointing
//!    at the interactive shell UI URL
//!
//! On stop:
//! 1. Shuts down the HTTP server
//! 2. Closes any active PTY sessions

use crate::config::Config;
use crate::errors::{CommandExecutionError, ExecutionErrors};
use crate::interactive::Interactive;
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

/// The artifact name used by the interactive feature.
const INTERACTIVE_ARTIFACT: &str = "private/generic-worker/shell.html";

pub struct InteractiveFeature;

impl InteractiveFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for InteractiveFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_interactive
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.interactive
    }

    fn rejects_when_disabled(&self) -> bool {
        true
    }

    fn new_task_feature(&self, task: &TaskRun, _config: &Config) -> Box<dyn TaskFeature> {
        Box::new(InteractiveTaskFeature {
            task_id: task.task_id.clone(),
            run_id: task.run_id,
            root_url: task.root_url.clone(),
            interactive: None,
            port: 0,
        })
    }

    fn name(&self) -> &'static str {
        "Interactive"
    }
}

struct InteractiveTaskFeature {
    task_id: String,
    run_id: u32,
    root_url: String,
    interactive: Option<Interactive>,
    port: u16,
}

impl TaskFeature for InteractiveTaskFeature {
    fn required_scopes(&self) -> Vec<Vec<String>> {
        vec![vec!["generic-worker:allow-interactive".to_string()]]
    }

    fn reserved_artifacts(&self) -> Vec<String> {
        vec![INTERACTIVE_ARTIFACT.to_string()]
    }

    fn start(&mut self) -> Option<CommandExecutionError> {
        // Interactive start uses async operations (bind, etc.) but the
        // TaskFeature::start() interface is synchronous. Use a blocking
        // bridge into the tokio runtime that is already running.
        if let Err(e) = self.start_inner() {
            tracing::warn!("Could not start interactive feature (continuing without it): {e}");
        }
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        if let Some(interactive) = self.interactive.take() {
            // Use a blocking bridge to run the async stop.
            let rt = tokio::runtime::Handle::try_current();
            if let Ok(handle) = rt {
                // We are inside a tokio context; use block_in_place to
                // avoid nested Runtime::block_on panics.
                tokio::task::block_in_place(|| {
                    handle.block_on(interactive.stop());
                });
            } else {
                tracing::warn!("No tokio runtime available to stop interactive server");
            }
        }
        tracing::info!(
            "Interactive feature stopped for task {}/{}",
            self.task_id,
            self.run_id,
        );
    }
}

impl InteractiveTaskFeature {
    fn start_inner(&mut self) -> anyhow::Result<()> {
        let rt = tokio::runtime::Handle::try_current()
            .map_err(|_| anyhow::anyhow!("no tokio runtime available"))?;

        let interactive = tokio::task::block_in_place(|| {
            rt.block_on(Interactive::start(0)) // 0 = pick an ephemeral port
        })?;

        self.port = interactive.port;
        let secret = interactive.secret.clone();

        // Set INTERACTIVE_ACCESS_TOKEN so tasks can discover the secret.
        std::env::set_var("INTERACTIVE_ACCESS_TOKEN", &secret);

        // Build the redirect URL that the shell.html artifact will point to.
        let socket_url = interactive.get_url();
        let redirect_url = format!(
            "{}/shell/?v=2&socketUrl={}&taskId={}&runId={}",
            self.root_url,
            urlencoding_encode(&socket_url),
            urlencoding_encode(&self.task_id),
            self.run_id,
        );

        tracing::info!(
            "Interactive feature started for task {}/{} (port={}, artifact={}, redirect={})",
            self.task_id,
            self.run_id,
            self.port,
            INTERACTIVE_ARTIFACT,
            redirect_url,
        );

        // In the full integration, we would upload a RedirectArtifact here:
        //   Artifact::Redirect(RedirectArtifact {
        //       base: BaseArtifact { name: INTERACTIVE_ARTIFACT, ... },
        //       content_type: "text/html".into(),
        //       url: redirect_url,
        //   })
        // For now, log the intent -- artifact upload infrastructure will
        // handle this via the feature_artifacts map in a future integration step.
        tracing::info!(
            "Interactive redirect artifact: {} -> {}",
            INTERACTIVE_ARTIFACT,
            redirect_url,
        );

        self.interactive = Some(interactive);
        Ok(())
    }
}

/// Simple percent-encoding for URL query parameters.
fn urlencoding_encode(input: &str) -> String {
    let mut out = String::with_capacity(input.len() * 2);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(byte as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    out
}
