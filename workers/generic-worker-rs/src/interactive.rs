//! Interactive shell session management.
//!
//! Provides WebSocket-based interactive shell access to task environments.
//! The module creates an HTTP server that handles WebSocket upgrades and
//! bridges them to a PTY-backed shell process.
//!
//! ## Message protocol
//!
//! Binary WebSocket messages use a type byte prefix:
//! - `1`: stdin data (remaining bytes forwarded to PTY)
//! - `2`: resize (bytes 1-2 = width as LE u16, bytes 3-4 = height as LE u16)

use anyhow::{Context, Result};
use rand::Rng;
use std::sync::Arc;
use tokio::sync::{watch, Notify};

/// Default shell to spawn when SHELL is unset.
#[cfg(unix)]
const DEFAULT_SHELL: &str = "/bin/sh";

/// WebSocket message type: stdin data.
const MSG_TYPE_STDIN: u8 = 1;

/// WebSocket message type: terminal resize.
const MSG_TYPE_RESIZE: u8 = 2;

/// Generate a random access token for interactive session authentication.
pub fn generate_secret() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
    let mut rng = rand::thread_rng();
    (0..44)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Handle for a running interactive session server.
pub struct Interactive {
    /// The port the server is listening on.
    pub port: u16,
    /// The secret required in the WebSocket URL path.
    pub secret: String,
    shutdown_tx: watch::Sender<bool>,
    server_done: Arc<Notify>,
}

impl Interactive {
    /// Start a new interactive session server.
    ///
    /// Binds an HTTP server on `port` that accepts WebSocket upgrades at
    /// `/shell/{secret}`. Returns the handle used to retrieve the URL and
    /// shut down the server.
    pub async fn start(port: u16) -> Result<Self> {
        let secret = generate_secret();
        let (shutdown_tx, shutdown_rx) = watch::channel(false);
        let server_done = Arc::new(Notify::new());
        let done_notifier = server_done.clone();

        let shared_secret = secret.clone();
        let app = build_router(shared_secret);

        let addr: std::net::SocketAddr = ([0, 0, 0, 0], port).into();
        let listener = tokio::net::TcpListener::bind(addr)
            .await
            .with_context(|| format!("failed to bind interactive server on port {port}"))?;

        let actual_port = listener.local_addr()?.port();

        tracing::info!("Interactive server listening on port {actual_port}");

        tokio::spawn(async move {
            let mut shutdown_rx = shutdown_rx;
            axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    loop {
                        if shutdown_rx.changed().await.is_err() {
                            break;
                        }
                        if *shutdown_rx.borrow() {
                            break;
                        }
                    }
                })
                .await
                .ok();
            done_notifier.notify_one();
        });

        Ok(Self {
            port: actual_port,
            secret,
            shutdown_tx,
            server_done,
        })
    }

    /// Get the full local WebSocket URL for the interactive endpoint.
    pub fn get_url(&self) -> String {
        format!("ws://localhost:{}/shell/{}", self.port, self.secret)
    }

    /// Shut down the interactive server.
    pub async fn stop(self) {
        let _ = self.shutdown_tx.send(true);
        self.server_done.notified().await;
        tracing::info!("Interactive server stopped");
    }
}

/// Build the axum router with the WebSocket upgrade handler.
fn build_router(secret: String) -> axum::Router {
    use axum::routing::any;

    axum::Router::new().route(
        "/shell/{secret}",
        any(
            move |path: axum::extract::Path<String>,
                  ws: axum::extract::WebSocketUpgrade| {
                let expected = secret.clone();
                async move { handle_ws_upgrade(path, ws, expected) }
            },
        ),
    )
}

/// Handle a WebSocket upgrade request, validating the secret.
fn handle_ws_upgrade(
    axum::extract::Path(provided_secret): axum::extract::Path<String>,
    ws: axum::extract::WebSocketUpgrade,
    expected_secret: String,
) -> axum::response::Response {
    if provided_secret != expected_secret {
        return axum::response::Response::builder()
            .status(axum::http::StatusCode::FORBIDDEN)
            .body(axum::body::Body::from("invalid secret"))
            .unwrap();
    }

    ws.on_upgrade(|socket| handle_ws_connection(socket))
}

/// Handle an established WebSocket connection by bridging it to a PTY.
async fn handle_ws_connection(socket: axum::extract::ws::WebSocket) {
    tracing::info!("Interactive WebSocket connection established");

    #[cfg(unix)]
    {
        if let Err(e) = handle_ws_connection_unix(socket).await {
            tracing::warn!("Interactive session ended with error: {e}");
        }
    }

    #[cfg(not(unix))]
    {
        use axum::extract::ws::Message;
        let mut socket = socket;
        let msg = Message::Close(None);
        let _ = futures_util::SinkExt::send(&mut socket, msg).await;
        tracing::warn!("Interactive sessions are not supported on this platform");
    }
}

// ---------------------------------------------------------------------------
// Unix PTY implementation
// ---------------------------------------------------------------------------

#[cfg(unix)]
async fn handle_ws_connection_unix(
    socket: axum::extract::ws::WebSocket,
) -> Result<()> {
    use axum::extract::ws::Message;
    use futures_util::{SinkExt, StreamExt};
    use nix::pty::openpty;
    use nix::sys::termios;
    use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // Open a PTY pair.
    let pty = openpty(None, None).context("openpty failed")?;
    let master_fd: OwnedFd = pty.master;
    let slave_fd: OwnedFd = pty.slave;

    // Put the slave into raw mode.
    {
        let mut attrs = termios::tcgetattr(&slave_fd).context("tcgetattr failed")?;
        termios::cfmakeraw(&mut attrs);
        termios::tcsetattr(&slave_fd, termios::SetArg::TCSANOW, &attrs)
            .context("tcsetattr failed")?;
    }

    // Determine which shell to spawn.
    let shell = std::env::var("SHELL").unwrap_or_else(|_| DEFAULT_SHELL.to_string());

    // Save the raw fd of the master for ioctl operations. The fd remains
    // valid as long as the tokio::fs::File below is alive.
    let master_raw_fd = master_fd.as_raw_fd();

    // Fork and exec the shell attached to the slave side of the PTY.
    let slave_raw_fd = slave_fd.as_raw_fd();
    let child_pid = unsafe {
        let pid = libc::fork();
        if pid < 0 {
            anyhow::bail!("fork failed: {}", std::io::Error::last_os_error());
        }
        if pid == 0 {
            // ---- child process ----
            // Create a new session and set the slave as the controlling terminal.
            libc::setsid();
            libc::ioctl(slave_raw_fd, libc::TIOCSCTTY as libc::c_ulong, 0);

            // Redirect stdio to the slave PTY.
            libc::dup2(slave_raw_fd, libc::STDIN_FILENO);
            libc::dup2(slave_raw_fd, libc::STDOUT_FILENO);
            libc::dup2(slave_raw_fd, libc::STDERR_FILENO);

            // Close the original fds if they are not one of 0/1/2.
            if slave_raw_fd > 2 {
                libc::close(slave_raw_fd);
            }
            libc::close(master_raw_fd);

            // Exec the shell.
            let c_shell = std::ffi::CString::new(shell.as_str()).unwrap();
            let c_args = [c_shell.as_ptr(), std::ptr::null()];
            libc::execvp(c_shell.as_ptr(), c_args.as_ptr());
            libc::_exit(127);
        }
        pid
    };

    // Parent: close the slave side (only the master is needed).
    drop(slave_fd);

    tracing::info!("Interactive shell spawned (pid={child_pid}, shell={shell})");

    // Wrap the master fd in an async file for tokio I/O. We use
    // `from_raw_fd` + `forget` on the OwnedFd so that the std File
    // takes ownership of the fd.
    let master_file = unsafe {
        let std_file = std::fs::File::from_raw_fd(master_fd.as_raw_fd());
        std::mem::forget(master_fd);
        tokio::fs::File::from_std(std_file)
    };

    let (mut pty_reader, mut pty_writer) = tokio::io::split(master_file);
    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Task: read from PTY and forward to WebSocket as binary messages.
    let pty_to_ws = tokio::spawn(async move {
        let mut buf = vec![0u8; 4096];
        loop {
            match pty_reader.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => {
                    let msg = Message::Binary(buf[..n].to_vec().into());
                    if ws_sender.send(msg).await.is_err() {
                        break;
                    }
                }
                Err(e) => {
                    // EIO is expected when the child shell exits.
                    if e.raw_os_error() == Some(libc::EIO) {
                        tracing::debug!("PTY master got EIO (child exited)");
                    } else {
                        tracing::debug!("PTY read error: {e}");
                    }
                    break;
                }
            }
        }
        let _ = ws_sender.close().await;
    });

    // Task: read from WebSocket and forward to PTY / handle resize.
    let ws_to_pty = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            let data = match msg {
                Message::Binary(d) => d.to_vec(),
                Message::Text(t) => t.into_bytes(),
                Message::Close(_) => break,
                _ => continue,
            };

            if data.is_empty() {
                continue;
            }

            match data[0] {
                MSG_TYPE_STDIN => {
                    if data.len() > 1 {
                        if pty_writer.write_all(&data[1..]).await.is_err() {
                            break;
                        }
                    }
                }
                MSG_TYPE_RESIZE => {
                    if data.len() >= 5 {
                        let cols = u16::from_le_bytes([data[1], data[2]]);
                        let rows = u16::from_le_bytes([data[3], data[4]]);
                        set_pty_window_size(master_raw_fd, cols, rows);
                    }
                }
                other => {
                    tracing::debug!("Unknown interactive message type: {other}");
                }
            }
        }
    });

    // Wait for either direction to finish, then cancel the other.
    tokio::select! {
        _ = pty_to_ws => {}
        _ = ws_to_pty => {}
    }

    // Reap the child process to avoid zombies.
    unsafe {
        let mut status: libc::c_int = 0;
        libc::waitpid(child_pid, &mut status, libc::WNOHANG);
    }

    tracing::info!("Interactive session ended (pid={child_pid})");
    Ok(())
}

/// Set the PTY window size via ioctl(TIOCSWINSZ).
#[cfg(unix)]
fn set_pty_window_size(fd: std::os::fd::RawFd, cols: u16, rows: u16) {
    let ws = libc::winsize {
        ws_row: rows,
        ws_col: cols,
        ws_xpixel: 0,
        ws_ypixel: 0,
    };
    unsafe {
        libc::ioctl(fd, libc::TIOCSWINSZ, &ws);
    }
    tracing::debug!("PTY resized to {cols}x{rows}");
}
