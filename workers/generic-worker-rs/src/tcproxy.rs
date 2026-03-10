//! Taskcluster proxy process management.
//!
//! Manages the external taskcluster-proxy process that provides
//! authenticated access to Taskcluster APIs from within tasks.
//! The proxy translates unauthenticated requests from the task
//! into authenticated Taskcluster API calls using the task's
//! temporary credentials.

use anyhow::{Context, Result};
use std::io::Write;
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use crate::config::Credentials;

/// How long to wait for the proxy port to become active.
const PORT_WAIT_TIMEOUT: Duration = Duration::from_secs(60);

/// How long to sleep between port polling attempts.
const PORT_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Wait for a TCP port to become active on the given address.
fn wait_for_port(address: &str, port: u16, timeout: Duration) -> Result<()> {
    let deadline = Instant::now() + timeout;
    let addr: std::net::SocketAddr = format!("{}:{}", address, port).parse()?;
    while Instant::now() < deadline {
        if let Ok(conn) = TcpStream::connect_timeout(&addr, Duration::from_secs(1)) {
            drop(conn);
            return Ok(());
        }
        std::thread::sleep(PORT_POLL_INTERVAL);
    }
    anyhow::bail!(
        "timeout waiting for taskcluster-proxy {}:{} to be active",
        address,
        port
    )
}

/// A running taskcluster-proxy process.
pub struct TaskclusterProxy {
    child: Mutex<Option<Child>>,
    pub address: String,
    pub port: u16,
    pub pid: u32,
}

impl TaskclusterProxy {
    /// Start a new taskcluster-proxy process.
    ///
    /// The proxy binds to `address:port` and forwards requests to the
    /// Taskcluster services at `root_url`, authenticating them with the
    /// given credentials. Additional authorized scopes can be passed to
    /// restrict what the proxy can do.
    pub fn new(
        executable: &str,
        address: &str,
        port: u16,
        root_url: &str,
        credentials: &Credentials,
        authorized_scopes: &[String],
    ) -> Result<Self> {
        let mut args = vec![
            "--port".to_string(),
            port.to_string(),
            "--root-url".to_string(),
            root_url.to_string(),
            "--client-id".to_string(),
            credentials.client_id.clone(),
            "--access-token".to_string(),
            credentials.access_token.clone(),
            "--ip-address".to_string(),
            address.to_string(),
        ];

        if let Some(ref cert) = credentials.certificate {
            args.push("--certificate".to_string());
            args.push(cert.clone());
        }

        // Authorized scopes are passed as positional arguments after the flags.
        for scope in authorized_scopes {
            args.push(scope.clone());
        }

        let child = Command::new(executable)
            .args(&args)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
            .with_context(|| {
                format!(
                    "failed to start taskcluster-proxy at {}:{}",
                    address, port
                )
            })?;

        let pid = child.id();
        tracing::info!("Started taskcluster-proxy process (PID {})", pid);

        let proxy = TaskclusterProxy {
            child: Mutex::new(Some(child)),
            address: address.to_string(),
            port,
            pid,
        };

        // Wait for the proxy to be ready to accept connections.
        wait_for_port(address, port, PORT_WAIT_TIMEOUT).with_context(|| {
            format!(
                "taskcluster-proxy did not become active on {}:{}",
                address, port
            )
        })?;

        Ok(proxy)
    }

    /// Get the proxy URL that tasks should use.
    pub fn url(&self) -> String {
        format!("http://{}:{}", self.address, self.port)
    }

    /// Update the proxy's credentials by sending a PUT to /credentials.
    ///
    /// This is called when the task is reclaimed to refresh the temporary
    /// credentials that the proxy uses for authentication.
    pub fn update_credentials(&self, credentials: &Credentials) -> Result<()> {
        let body = serde_json::to_vec(credentials)
            .context("failed to serialize credentials for proxy update")?;

        let addr: std::net::SocketAddr =
            format!("{}:{}", self.address, self.port).parse()?;
        let mut stream = TcpStream::connect_timeout(&addr, Duration::from_secs(10))
            .context("failed to connect to taskcluster-proxy for credential update")?;

        // Send a raw HTTP PUT request with the JSON body.
        let request = format!(
            "PUT /credentials HTTP/1.1\r\n\
             Host: {}:{}\r\n\
             Content-Type: application/json\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\
             \r\n",
            self.address,
            self.port,
            body.len()
        );
        stream.write_all(request.as_bytes())?;
        stream.write_all(&body)?;
        stream.flush()?;

        // Read enough of the response to check the status code.
        let mut response_buf = [0u8; 256];
        let n = std::io::Read::read(&mut stream, &mut response_buf)?;
        let response_str = String::from_utf8_lossy(&response_buf[..n]);

        // Check for HTTP 200 OK.
        if !response_str.starts_with("HTTP/1.1 200")
            && !response_str.starts_with("HTTP/1.0 200")
        {
            // Extract the status line for the error message.
            let status_line = response_str.lines().next().unwrap_or("unknown");
            anyhow::bail!(
                "taskcluster-proxy credential update failed: {}",
                status_line
            );
        }

        tracing::info!(
            "Successfully refreshed taskcluster-proxy credentials: {}",
            credentials.client_id
        );
        Ok(())
    }

    /// Terminate the proxy process.
    pub fn terminate(&mut self) -> Result<()> {
        let mut guard = self
            .child
            .lock()
            .map_err(|e| anyhow::anyhow!("lock poisoned: {}", e))?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
            tracing::info!("Stopped taskcluster-proxy process (PID {})", self.pid);
        }
        Ok(())
    }
}

impl Drop for TaskclusterProxy {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}
