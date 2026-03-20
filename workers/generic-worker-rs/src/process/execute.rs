//! Command execution core.

use std::io;
use std::process::{ExitStatus, Stdio};
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, AsyncWrite, AsyncWriteExt, BufReader};
use tokio::process::Command as TokioCommand;
use tokio::sync::{watch, Mutex};

use super::monitor::ResourceUsage;
use super::PlatformData;

/// Result of a command execution.
#[derive(Debug)]
pub struct Result {
    /// System-level error (e.g., failed to start process).
    pub system_error: Option<io::Error>,
    /// Exit status of the process.
    pub exit_status: Option<ExitStatus>,
    /// Wall-clock duration of execution.
    pub duration: Duration,
    /// Whether the process was aborted.
    pub aborted: bool,
    /// Resource usage during execution.
    pub usage: Option<ResourceUsage>,
    /// Exit code of the process.
    pub exit_code: i32,
    /// PID of the process.
    pub pid: u32,
}

impl Result {
    /// Returns true if the command completed successfully (exit code 0).
    pub fn succeeded(&self) -> bool {
        self.system_error.is_none() && !self.aborted && self.exit_code == 0
    }

    /// Returns true if the command failed (non-zero exit code or error).
    pub fn failed(&self) -> bool {
        !self.succeeded()
    }

    /// Returns true if the process crashed (system error).
    pub fn crashed(&self) -> bool {
        self.system_error.is_some()
    }

    /// Returns a verdict string: "SUCCEEDED", "FAILED", or "ABORTED".
    pub fn verdict(&self) -> &'static str {
        if self.aborted {
            "ABORTED"
        } else if self.succeeded() {
            "SUCCEEDED"
        } else {
            "FAILED"
        }
    }

    /// Returns a description of the failure cause, if any.
    pub fn failure_cause(&self) -> Option<String> {
        if let Some(ref err) = self.system_error {
            Some(format!("system error: {err}"))
        } else if self.aborted {
            Some("process was aborted".to_string())
        } else if self.exit_code != 0 {
            Some(format!("exit code {}", self.exit_code))
        } else {
            None
        }
    }
}

impl std::fmt::Display for Result {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{} (exit code: {}, duration: {:?}, pid: {})",
            self.verdict(),
            self.exit_code,
            self.duration,
            self.pid,
        )?;
        if let Some(ref usage) = self.usage {
            write!(
                f,
                " [peak memory: {}]",
                super::format_memory_string(usage.peak_system_memory_used)
            )?;
        }
        Ok(())
    }
}

/// Builder for creating commands with platform-specific configuration.
pub struct CommandBuilder {
    program: String,
    args: Vec<String>,
    working_directory: String,
    env: Vec<(String, String)>,
    platform_data: Option<PlatformData>,
    capture_output: bool,
}

impl CommandBuilder {
    pub fn new(command_line: &[String], working_directory: &str) -> Self {
        let (program, args) = if command_line.is_empty() {
            (String::new(), Vec::new())
        } else {
            (
                command_line[0].clone(),
                command_line[1..].to_vec(),
            )
        };

        Self {
            program,
            args,
            working_directory: working_directory.to_string(),
            env: Vec::new(),
            platform_data: None,
            capture_output: true,
        }
    }

    pub fn env(mut self, vars: Vec<(String, String)>) -> Self {
        self.env = vars;
        self
    }

    pub fn platform_data(mut self, pd: PlatformData) -> Self {
        self.platform_data = Some(pd);
        self
    }

    pub fn capture_output(mut self, capture: bool) -> Self {
        self.capture_output = capture;
        self
    }

    pub fn build(self) -> Command {
        Command {
            program: self.program,
            args: self.args,
            working_directory: self.working_directory,
            env: self.env,
            platform_data: self.platform_data.unwrap_or_default(),
            capture_output: self.capture_output,
            abort_tx: None,
            resource_monitor: None,
        }
    }
}

/// A command ready for execution.
pub struct Command {
    program: String,
    args: Vec<String>,
    working_directory: String,
    env: Vec<(String, String)>,
    platform_data: PlatformData,
    capture_output: bool,
    abort_tx: Option<watch::Sender<bool>>,
    /// Resource monitor callback, set by the resource monitor feature.
    pub resource_monitor:
        Option<Box<dyn FnOnce(tokio::sync::mpsc::Sender<ResourceUsage>, watch::Receiver<bool>) + Send>>,
}

impl Command {
    /// Set an environment variable for this command.
    pub fn set_env(&mut self, key: &str, value: &str) {
        self.env.push((key.to_string(), value.to_string()));
    }

    /// Create an abort channel and return the sender.
    pub fn abort_handle(&mut self) -> watch::Sender<bool> {
        let (tx, _rx) = watch::channel(false);
        self.abort_tx = Some(tx.clone());
        tx
    }

    /// Set an external abort sender. When this sender is signalled (value
    /// becomes true), the running process will be killed.
    pub fn set_abort_sender(&mut self, tx: watch::Sender<bool>) {
        self.abort_tx = Some(tx);
    }

    /// Execute the command and return the result.
    pub async fn execute(
        &mut self,
        mut log_writer: Option<Box<dyn AsyncWrite + Unpin + Send>>,
    ) -> Result {
        let start = Instant::now();

        let mut cmd = TokioCommand::new(&self.program);
        cmd.args(&self.args);
        cmd.current_dir(&self.working_directory);

        // Set environment
        cmd.env_clear();
        for (key, value) in &self.env {
            cmd.env(key, value);
        }

        // Apply platform-specific settings
        self.platform_data.apply(&mut cmd);

        if self.capture_output {
            cmd.stdout(Stdio::piped());
            cmd.stderr(Stdio::piped());
        }

        // Set process group for unix
        #[cfg(unix)]
        {
            use std::os::unix::process::CommandExt;
            // Safety: pre_exec runs after fork but before exec
            unsafe {
                cmd.pre_exec(|| {
                    // Create new process group
                    libc::setpgid(0, 0);
                    Ok(())
                });
            }
        }

        // Spawn the process
        let mut child = match cmd.spawn() {
            Ok(child) => child,
            Err(e) => {
                return Result {
                    system_error: Some(e),
                    exit_status: None,
                    duration: start.elapsed(),
                    aborted: false,
                    usage: None,
                    exit_code: -1,
                    pid: 0,
                };
            }
        };

        let pid = child.id().unwrap_or(0);

        // Set up abort watching
        let (abort_tx, abort_rx) = watch::channel(false);
        if let Some(ref existing_tx) = self.abort_tx {
            // Use the existing sender
            drop(abort_tx);
        }

        // Capture stdout/stderr and write to log
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Spawn output forwarding tasks.
        // When a log_writer is provided, forward stdout/stderr to it.
        // When no log_writer is provided but output is captured (piped),
        // forward to the parent process's stdout/stderr so that the
        // worker binary's output includes task command output. This is
        // important for tests that capture the worker's stdout to verify
        // task output.
        let log_complete = if let Some(writer) = log_writer.take() {
            let writer = std::sync::Arc::new(Mutex::new(writer));
            let mut handles = Vec::new();

            if let Some(stdout) = stdout {
                let w = writer.clone();
                handles.push(tokio::spawn(async move {
                    let mut reader = BufReader::new(stdout);
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match reader.read_line(&mut line).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let mut w = w.lock().await;
                                let _ = w.write_all(line.as_bytes()).await;
                            }
                            Err(_) => break,
                        }
                    }
                }));
            }

            if let Some(stderr) = stderr {
                let w = writer.clone();
                handles.push(tokio::spawn(async move {
                    let mut reader = BufReader::new(stderr);
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match reader.read_line(&mut line).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let mut w = w.lock().await;
                                let _ = w.write_all(line.as_bytes()).await;
                            }
                            Err(_) => break,
                        }
                    }
                }));
            }

            Some(handles)
        } else if self.capture_output {
            // No log_writer but output is piped: forward to parent stdout/stderr
            // so that the worker process's output stream contains task output.
            let mut handles = Vec::new();

            if let Some(child_stdout) = stdout {
                handles.push(tokio::spawn(async move {
                    let mut reader = BufReader::new(child_stdout);
                    let mut parent_stdout = tokio::io::stdout();
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match reader.read_line(&mut line).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let _ = parent_stdout.write_all(line.as_bytes()).await;
                                let _ = parent_stdout.flush().await;
                            }
                            Err(_) => break,
                        }
                    }
                }));
            }

            if let Some(child_stderr) = stderr {
                handles.push(tokio::spawn(async move {
                    let mut reader = BufReader::new(child_stderr);
                    let mut parent_stderr = tokio::io::stderr();
                    let mut line = String::new();
                    loop {
                        line.clear();
                        match reader.read_line(&mut line).await {
                            Ok(0) => break,
                            Ok(_) => {
                                let _ = parent_stderr.write_all(line.as_bytes()).await;
                                let _ = parent_stderr.flush().await;
                            }
                            Err(_) => break,
                        }
                    }
                }));
            }

            Some(handles)
        } else {
            None
        };

        // Wait for process completion or abort
        let (exit_status, aborted) = tokio::select! {
            status = child.wait() => {
                match status {
                    Ok(s) => (Some(s), false),
                    Err(_) => (None, false),
                }
            }
            _ = async {
                if let Some(ref tx) = self.abort_tx {
                    let mut rx = tx.subscribe();
                    while !*rx.borrow() {
                        if rx.changed().await.is_err() {
                            // Sender dropped, no abort coming
                            std::future::pending::<()>().await;
                        }
                    }
                } else {
                    std::future::pending::<()>().await;
                }
            } => {
                // Kill the process
                let _ = kill_process(&child, pid);
                let status = child.wait().await.ok();
                (status, true)
            }
        };

        // Wait for log forwarding to complete
        if let Some(handles) = log_complete {
            for handle in handles {
                let _ = handle.await;
            }
        }

        let duration = start.elapsed();
        let exit_code = exit_status
            .and_then(|s| s.code())
            .unwrap_or(if aborted { -1 } else { -1 });

        Result {
            system_error: None,
            exit_status,
            duration,
            aborted,
            usage: None,
            exit_code,
            pid,
        }
    }

    /// Returns the command as a string for display.
    pub fn display(&self) -> String {
        let mut parts = vec![self.program.clone()];
        parts.extend(self.args.iter().cloned());
        parts.join(" ")
    }
}

impl std::fmt::Display for Command {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.display())
    }
}

/// Kill a process and all its children.
#[cfg(unix)]
fn kill_process(
    child: &tokio::process::Child,
    pid: u32,
) -> std::result::Result<(), io::Error> {
    // Kill the entire process group
    unsafe {
        libc::kill(-(pid as i32), libc::SIGKILL);
    }
    Ok(())
}

#[cfg(windows)]
fn kill_process(
    _child: &tokio::process::Child,
    pid: u32,
) -> std::result::Result<(), io::Error> {
    // Use taskkill.exe /pid /f /t for process tree killing, matching the
    // Go generic-worker behavior.
    super::windows::kill_process_tree(pid)
}
