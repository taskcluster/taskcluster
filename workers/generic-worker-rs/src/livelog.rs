//! LiveLog process management.
//!
//! Manages the external livelog process that provides real-time
//! log streaming over HTTP. The livelog process exposes two ports:
//! a PUT port for writing log data and a GET port for reading it.
//!
//! Log data is streamed to livelog via an HTTP PUT request using an
//! io pipe -- the write half is returned as `log_writer` for use
//! by the task's log infrastructure.

use anyhow::{Context, Result};
use std::io::{self, Write};
use std::net::TcpStream;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use rand::Rng;

/// How long to wait for the livelog PUT port to become active.
const PORT_WAIT_TIMEOUT: Duration = Duration::from_secs(60);

/// How long to sleep between port polling attempts.
const PORT_POLL_INTERVAL: Duration = Duration::from_millis(100);

/// Generate a random access token (slug-like) for livelog authentication.
fn generate_secret() -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
    let mut rng = rand::thread_rng();
    (0..22)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Wait for a TCP port to become active on localhost.
fn wait_for_local_port(port: u16, timeout: Duration) -> Result<()> {
    let deadline = Instant::now() + timeout;
    let addr: std::net::SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();
    while Instant::now() < deadline {
        if let Ok(conn) = TcpStream::connect_timeout(&addr, Duration::from_secs(1)) {
            drop(conn);
            return Ok(());
        }
        std::thread::sleep(PORT_POLL_INTERVAL);
    }
    anyhow::bail!(
        "timeout waiting for livelog port {} to become active after {:?}",
        port,
        timeout
    )
}

/// A running livelog process with its log writer.
pub struct LiveLog {
    child: Mutex<Option<Child>>,
    secret: String,
    pub put_port: u16,
    pub get_port: u16,
    /// The write half of the pipe connected to livelog via HTTP PUT.
    /// Write log data here and it will be streamed to livelog consumers.
    pub log_writer: Option<io::PipeWriter>,
    /// Temporary directory used by the livelog process for streaming files.
    tmp_dir: Option<tempfile::TempDir>,
}

impl LiveLog {
    /// Start a new livelog process.
    ///
    /// Spawns the livelog executable, waits for its PUT port to become active,
    /// and connects an HTTP PUT request with a pipe for streaming log data.
    /// The `log_writer` field can be used to write log output that will be
    /// streamed to any consumers reading from the GET port.
    pub fn new(executable: &str, put_port: u16, get_port: u16) -> Result<Self> {
        let secret = generate_secret();

        // Create a dedicated temporary directory for livelog's streaming files.
        let tmp_dir = tempfile::Builder::new()
            .prefix("livelog-")
            .tempdir()
            .context("could not create temp dir for livelog")?;

        let child = Command::new(executable)
            .env("ACCESS_TOKEN", &secret)
            .env("LIVELOG_PUT_PORT", put_port.to_string())
            .env("LIVELOG_GET_PORT", get_port.to_string())
            .env("LIVELOG_TEMP_DIR", tmp_dir.path().to_str().unwrap_or(""))
            // Explicitly remove TLS env vars so livelog uses plain HTTP.
            .env_remove("SERVER_KEY_FILE")
            .env_remove("SERVER_CRT_FILE")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .context("failed to start livelog process")?;

        let mut livelog = LiveLog {
            child: Mutex::new(Some(child)),
            secret,
            put_port,
            get_port,
            log_writer: None,
            tmp_dir: Some(tmp_dir),
        };

        // Wait for the PUT port to become active, then connect the input stream.
        if let Err(e) = livelog.connect_input_stream() {
            // If we can't connect, kill the process to avoid orphans.
            livelog.terminate().ok();
            return Err(e);
        }

        Ok(livelog)
    }

    /// Connect an HTTP PUT pipe to the livelog PUT endpoint.
    ///
    /// Creates an OS pipe, spawns a background thread that sends the read half
    /// as the body of a chunked HTTP PUT to the livelog PUT URL via raw TCP,
    /// and stores the write half in `self.log_writer`.
    fn connect_input_stream(&mut self) -> Result<()> {
        // Wait for the PUT port to be ready.
        wait_for_local_port(self.put_port, PORT_WAIT_TIMEOUT)
            .context("livelog PUT port did not become active")?;

        let (reader, writer) =
            std::io::pipe().context("failed to create pipe for livelog")?;

        let put_port = self.put_port;

        // Spawn a background thread that streams the pipe reader to livelog
        // via a raw HTTP PUT with chunked transfer encoding. We use raw TCP
        // rather than reqwest::blocking because the blocking feature is not
        // enabled in Cargo.toml.
        std::thread::Builder::new()
            .name("livelog-put".into())
            .spawn(move || {
                if let Err(e) = stream_to_livelog(put_port, reader) {
                    // This error is expected when the writer is closed/dropped
                    // during normal shutdown, so only log at debug level.
                    tracing::debug!("livelog PUT stream ended: {}", e);
                }
            })
            .context("failed to spawn livelog PUT thread")?;

        self.log_writer = Some(writer);
        Ok(())
    }

    /// Get the URL for writing logs (used internally for the PUT connection).
    pub fn put_url(&self) -> String {
        format!("http://localhost:{}/log", self.put_port)
    }

    /// Get the URL for reading logs (includes the access token for authentication).
    pub fn get_url(&self) -> String {
        format!("http://localhost:{}/log/{}", self.get_port, self.secret)
    }

    /// Terminate the livelog process.
    ///
    /// Closes the log writer first (which completes the PUT request),
    /// then kills the livelog process and cleans up the temp directory.
    pub fn terminate(&mut self) -> Result<()> {
        // Close the log writer to signal end of input.
        self.log_writer.take();

        let mut guard = self
            .child
            .lock()
            .map_err(|e| anyhow::anyhow!("lock poisoned: {}", e))?;
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        // Clean up temporary directory.
        self.tmp_dir.take();

        Ok(())
    }
}

impl Drop for LiveLog {
    fn drop(&mut self) {
        let _ = self.terminate();
    }
}

/// Stream data from a pipe reader to livelog via a raw HTTP PUT request
/// with chunked transfer encoding over TCP.
fn stream_to_livelog(port: u16, mut reader: io::PipeReader) -> Result<()> {
    let addr = format!("127.0.0.1:{}", port);
    let mut stream = TcpStream::connect(&addr)
        .with_context(|| format!("failed to connect to livelog at {}", addr))?;

    // Send HTTP PUT request headers with chunked transfer encoding.
    let headers = format!(
        "PUT /log HTTP/1.1\r\n\
         Host: localhost:{}\r\n\
         Transfer-Encoding: chunked\r\n\
         Content-Type: application/octet-stream\r\n\
         \r\n",
        port
    );
    stream.write_all(headers.as_bytes())?;

    // Stream data using chunked encoding.
    let mut buf = [0u8; 8192];
    loop {
        let n = match io::Read::read(&mut reader, &mut buf) {
            Ok(0) => break,
            Ok(n) => n,
            Err(e) if e.kind() == io::ErrorKind::BrokenPipe => break,
            Err(e) => return Err(e.into()),
        };

        // Write chunk size in hex, followed by CRLF, data, CRLF.
        let chunk_header = format!("{:x}\r\n", n);
        stream.write_all(chunk_header.as_bytes())?;
        stream.write_all(&buf[..n])?;
        stream.write_all(b"\r\n")?;
        stream.flush()?;
    }

    // Send the terminating zero-length chunk.
    stream.write_all(b"0\r\n\r\n")?;
    stream.flush()?;

    Ok(())
}
