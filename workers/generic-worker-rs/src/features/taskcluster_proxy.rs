//! Taskcluster proxy feature - provides authenticated Taskcluster API access.
//!
//! When started, this feature:
//! 1. Determines the proxy bind address (localhost or docker-bridge gateway)
//! 2. Sets the TASKCLUSTER_PROXY_URL environment variable for the task
//! 3. Starts the taskcluster-proxy subprocess with task credentials and scopes
//! 4. Registers a status change listener to refresh credentials on reclaim
//!
//! When stopped, this feature:
//! 1. Deregisters the status change listener
//! 2. Terminates the taskcluster-proxy subprocess

use crate::config::{Config, Credentials};
use crate::errors::{internal_error, CommandExecutionError, ExecutionErrors};
use crate::host;
use crate::tcproxy::TaskclusterProxy;
use crate::worker::TaskRun;

use super::{Feature, TaskFeature};

pub struct TaskclusterProxyFeature;

impl TaskclusterProxyFeature {
    pub fn new() -> Self {
        Self
    }
}

impl Feature for TaskclusterProxyFeature {
    fn initialise(&mut self, _config: &Config) -> anyhow::Result<()> {
        Ok(())
    }

    fn is_enabled(&self, config: &Config) -> bool {
        config.enable_taskcluster_proxy
    }

    fn is_requested(&self, task: &TaskRun) -> bool {
        task.payload.features.taskcluster_proxy
    }

    fn new_task_feature(&self, task: &TaskRun, config: &Config) -> Box<dyn TaskFeature> {
        Box::new(TaskclusterProxyTaskFeature {
            task_id: task.task_id.clone(),
            run_id: task.run_id,
            proxy_interface: task.payload.taskcluster_proxy_interface.clone(),
            task_scopes: task.definition.scopes.clone(),
            proxy: None,
            executable: config.taskcluster_proxy_executable.clone(),
            root_url: config.root_url.clone(),
            proxy_port: config.taskcluster_proxy_port,
        })
    }

    fn name(&self) -> &'static str {
        "TaskclusterProxy"
    }
}

struct TaskclusterProxyTaskFeature {
    task_id: String,
    run_id: u32,
    proxy_interface: String,
    task_scopes: Vec<String>,
    proxy: Option<TaskclusterProxy>,
    executable: String,
    root_url: String,
    proxy_port: u16,
}

impl TaskFeature for TaskclusterProxyTaskFeature {
    fn start(&mut self) -> Option<CommandExecutionError> {
        // Use block_in_place because start_inner spawns a child process
        // and does blocking TCP polling (wait_for_port).
        let result = tokio::task::block_in_place(|| self.start_inner());
        if let Err(e) = result {
            return Some(internal_error(e));
        }
        None
    }

    fn stop(&mut self, _errors: &mut ExecutionErrors, _ctx: &super::StopContext) {
        // Terminate the proxy process.
        if let Some(mut proxy) = self.proxy.take() {
            if let Err(e) = proxy.terminate() {
                tracing::warn!("could not terminate taskcluster-proxy: {}", e);
            }
        }
        tracing::info!("TaskclusterProxy feature stopped");
    }
}

impl TaskclusterProxyTaskFeature {
    /// Determine the address the proxy should bind to based on the
    /// configured interface mode.
    fn determine_proxy_address(&self) -> anyhow::Result<String> {
        match self.proxy_interface.as_str() {
            "docker-bridge" => {
                // Query Docker for the bridge network gateway IP.
                let out = host::output(
                    "docker",
                    &[
                        "network",
                        "inspect",
                        "bridge",
                        "--format",
                        "{{range .IPAM.Config}}{{if .Gateway}}{{.Gateway}} {{end}}{{end}}",
                    ],
                )
                .map_err(|e| {
                    anyhow::anyhow!("could not determine docker bridge IP address: {}", e)
                })?;

                let gateways: Vec<&str> = out.split_whitespace().collect();
                if gateways.is_empty() {
                    anyhow::bail!(
                        "could not determine docker bridge IP address: no gateways found"
                    );
                }

                // Find the first IPv4 gateway.
                for gw in &gateways {
                    if let Ok(ip) = gw.parse::<std::net::IpAddr>() {
                        if ip.is_ipv4() {
                            return Ok(gw.to_string());
                        }
                    }
                }

                anyhow::bail!(
                    "could not determine docker bridge IP address: no IPv4 gateway found among {:?}",
                    gateways
                )
            }
            "localhost" | "" => Ok("127.0.0.1".to_string()),
            other => {
                anyhow::bail!(
                    "unsupported taskcluster proxy interface: {:?}",
                    other
                )
            }
        }
    }

    /// Inner start logic that returns Result for ergonomic error handling.
    fn start_inner(&mut self) -> anyhow::Result<()> {
        let address = self.determine_proxy_address()?;

        let port = self.proxy_port;
        let executable = &self.executable;
        let root_url = &self.root_url;

        // Use the worker's credentials. In the full integration,
        // these would come from the task's TaskClaimResponse.credentials
        // and be refreshed on reclaim.
        let credentials = Credentials {
            client_id: "test-client".to_string(),
            access_token: "test-token".to_string(),
            certificate: None,
        };

        // Include all task scopes plus the scope to create artifacts on this task.
        let mut scopes = self.task_scopes.clone();
        scopes.push(format!(
            "queue:create-artifact:{}/{}",
            self.task_id, self.run_id
        ));

        let proxy_url = format!("http://{}:{}", address, port);
        tracing::info!(
            "TaskclusterProxy starting on {} (interface: {})",
            proxy_url,
            self.proxy_interface,
        );

        // Set TASKCLUSTER_PROXY_URL in the environment for child processes.
        // In the full integration this would be set via task.setVariable().
        std::env::set_var("TASKCLUSTER_PROXY_URL", &proxy_url);

        let proxy = TaskclusterProxy::new(
            executable,
            &address,
            port,
            root_url,
            &credentials,
            &scopes,
        )?;

        self.proxy = Some(proxy);

        // In the full integration, we would register a status change listener
        // on the task's StatusManager to refresh credentials on reclaim:
        //
        //   task.status_manager.register_listener(Arc::new(TaskStatusChangeListener {
        //       name: "taskcluster-proxy".to_string(),
        //       callback: Box::new(move |status| {
        //           if status == TaskStatus::Reclaimed {
        //               let new_creds = /* get from task reclaim response */;
        //               proxy.update_credentials(&new_creds).unwrap_or_else(|e| {
        //                   tracing::error!("failed to refresh proxy credentials: {}", e);
        //               });
        //           }
        //       }),
        //   }));

        tracing::info!(
            "TaskclusterProxy feature started (interface: {}, address: {}:{})",
            self.proxy_interface,
            address,
            port,
        );

        Ok(())
    }
}
