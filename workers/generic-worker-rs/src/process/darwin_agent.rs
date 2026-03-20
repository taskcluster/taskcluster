//! Darwin (macOS) launch agent protocol for the multiuser engine.
//!
//! On macOS, GUI access requires processes to be launched from within a login
//! session. The generic worker daemon communicates with a launch agent running
//! in the user's GUI session via a Unix domain socket protocol.
//!
//! The protocol has three phases:
//! 1. Send file descriptors (stdin/stdout/stderr pipes) + handshake JSON via
//!    SCM_RIGHTS ancillary data
//! 2. Wait for ACK byte ('K') from the agent
//! 3. Send the full command request as a length-prefixed (framed) JSON message
//!
//! The agent responds with framed JSON messages: first an initial response
//! containing the PID, then a final response with the exit code.

use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::os::unix::io::RawFd;
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::time::{Duration, Instant};

use anyhow::{bail, Context, Result};
use nix::sys::socket::{sendmsg, ControlMessage, MsgFlags};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

use super::PlatformData;

/// The socket path where the launch agent listens.
pub const LAUNCH_AGENT_SOCKET: &str = "/tmp/launch-agent.sock";

/// ACK byte sent by the agent after consuming the handshake (Phase 2).
const HANDSHAKE_ACK_BYTE: u8 = b'K';

/// Command request sent to the launch agent.
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandRequest {
    pub path: String,
    pub args: Vec<String>,
    pub env: Vec<String>,
    pub dir: String,
    pub stdin: bool,
    pub stdout: bool,
    pub stderr: bool,
    pub setctty: bool,
    pub setpgid: bool,
    pub setsid: bool,
}

/// Handshake metadata sent alongside file descriptors via SCM_RIGHTS.
#[derive(Debug, Serialize, Deserialize)]
pub struct FDHandshake {
    pub num_fds: usize,
    pub payload_size: usize,
}

/// Initial response from the agent containing the PID.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct AgentResponse {
    #[serde(default)]
    pub pid: i32,
    #[serde(default)]
    pub exit_code: i32,
    #[serde(default)]
    pub aborted: bool,
}

/// Write a length-prefixed frame: big-endian u32 length followed by payload.
pub fn write_frame(writer: &mut dyn Write, payload: &[u8]) -> io::Result<()> {
    let len_bytes = (payload.len() as u32).to_be_bytes();
    writer.write_all(&len_bytes)?;
    writer.write_all(payload)?;
    Ok(())
}

/// Read a length-prefixed frame: big-endian u32 length followed by payload.
pub fn read_frame(reader: &mut dyn Read) -> io::Result<Vec<u8>> {
    let mut len_buf = [0u8; 4];
    reader.read_exact(&mut len_buf)?;
    let length = u32::from_be_bytes(len_buf) as usize;
    let mut buf = vec![0u8; length];
    reader.read_exact(&mut buf)?;
    Ok(buf)
}

/// Connect to the launch agent Unix domain socket with retry.
///
/// Retries every 500ms until the socket is available or the timeout expires.
/// Default timeout is 60 seconds.
pub fn connect_with_retry(socket_path: &str, timeout: Duration) -> Result<UnixStream> {
    let deadline = Instant::now() + timeout;
    let retry_interval = Duration::from_millis(500);

    loop {
        if Instant::now() >= deadline {
            bail!(
                "timeout reached waiting for launch agent socket at {}",
                socket_path
            );
        }

        // Check if socket file exists before attempting connection
        if !Path::new(socket_path).exists() {
            std::thread::sleep(retry_interval);
            continue;
        }

        match UnixStream::connect(socket_path) {
            Ok(stream) => return Ok(stream),
            Err(e) => {
                warn!("Failed to connect to launch agent socket: {}", e);
                std::thread::sleep(retry_interval);
            }
        }
    }
}

/// Returns true if the command should NOT be sent to the launch agent.
///
/// Commands run as root (uid 0) or in headless mode (no GUI session) should
/// be launched as regular subprocesses instead.
pub fn should_not_use_agent(pd: &PlatformData, headless: bool) -> bool {
    headless || pd.uid.is_none() || pd.uid == Some(0)
}

/// Pipes created for communication between the daemon and the agent.
pub struct AgentPipes {
    /// The read end of stdin pipe (sent to agent), or None.
    pub stdin_read: Option<std::fs::File>,
    /// The write end of stdin pipe (kept by daemon), or None.
    pub stdin_write: Option<std::fs::File>,
    /// The read end of stdout pipe (kept by daemon), or None.
    pub stdout_read: Option<std::fs::File>,
    /// The write end of stdout pipe (sent to agent), or None.
    pub stdout_write: Option<std::fs::File>,
    /// The read end of stderr pipe (kept by daemon), or None.
    pub stderr_read: Option<std::fs::File>,
    /// The write end of stderr pipe (sent to agent), or None.
    pub stderr_write: Option<std::fs::File>,
}

/// Execute a command via the launch agent protocol.
///
/// This implements the three-phase protocol:
/// 1. Create pipes, send FDs via SCM_RIGHTS with handshake JSON
/// 2. Wait for ACK byte from agent
/// 3. Send command request as framed JSON
///
/// Returns the socket connection and pipes for further communication.
pub fn start_via_agent(
    path: &str,
    args: &[String],
    env: &HashMap<String, String>,
    dir: &str,
    want_stdin: bool,
    want_stdout: bool,
    want_stderr: bool,
) -> Result<(UnixStream, AgentPipes, AgentResponse)> {
    use std::os::unix::io::AsRawFd;

    // Build the command request
    let env_list: Vec<String> = env.iter().map(|(k, v)| format!("{k}={v}")).collect();
    let mut request = CommandRequest {
        path: path.to_string(),
        args: args.to_vec(),
        env: env_list,
        dir: dir.to_string(),
        stdin: false,
        stdout: false,
        stderr: false,
        setctty: false,
        setpgid: true,
        setsid: false,
    };

    // Connect to the launch agent
    let mut conn =
        connect_with_retry(LAUNCH_AGENT_SOCKET, Duration::from_secs(60))
            .context("connecting to launch agent")?;

    // Create pipes and collect FDs to send
    let mut fds: Vec<RawFd> = Vec::new();
    let mut pipes = AgentPipes {
        stdin_read: None,
        stdin_write: None,
        stdout_read: None,
        stdout_write: None,
        stderr_read: None,
        stderr_write: None,
    };

    if want_stdin {
        request.stdin = true;
        let (read_end, write_end) = os_pipe()?;
        fds.push(raw_fd(&read_end));
        pipes.stdin_read = Some(read_end);
        pipes.stdin_write = Some(write_end);
    }

    if want_stdout {
        request.stdout = true;
        let (read_end, write_end) = os_pipe()?;
        fds.push(raw_fd(&write_end));
        pipes.stdout_read = Some(read_end);
        pipes.stdout_write = Some(write_end);
    }

    if want_stderr {
        request.stderr = true;
        let (read_end, write_end) = os_pipe()?;
        fds.push(raw_fd(&write_end));
        pipes.stderr_read = Some(read_end);
        pipes.stderr_write = Some(write_end);
    }

    debug!("FDs to send: {:?}", fds);

    // Marshal the full command request
    let payload =
        serde_json::to_vec(&request).context("failed to marshal command request")?;

    debug!(
        "Request to be sent from daemon ({} bytes): {}",
        payload.len(),
        String::from_utf8_lossy(&payload)
    );

    // Three-phase protocol with ACK synchronization:

    // Phase 1: Send file descriptors + handshake via sendmsg with SCM_RIGHTS
    let handshake = FDHandshake {
        num_fds: fds.len(),
        payload_size: payload.len(),
    };

    let handshake_json =
        serde_json::to_vec(&handshake).context("failed to marshal handshake")?;

    let iov = [io::IoSlice::new(&handshake_json)];
    let conn_fd = conn.as_raw_fd();

    if fds.is_empty() {
        // No FDs to send, just write the handshake directly
        sendmsg::<()>(conn_fd, &iov, &[], MsgFlags::empty(), None)
            .context("failed to send handshake")?;
    } else {
        let cmsg = [ControlMessage::ScmRights(&fds)];
        sendmsg::<()>(conn_fd, &iov, &cmsg, MsgFlags::empty(), None)
            .context("failed to send handshake with FDs via SCM_RIGHTS")?;
    }

    debug!(
        "Sent handshake: {} FDs, {} byte payload",
        fds.len(),
        payload.len()
    );

    // Phase 2: Wait for ACK from agent (single byte confirming handshake received)
    let mut ack_buf = [0u8; 1];
    conn.read_exact(&mut ack_buf)
        .context("failed to read handshake ACK")?;

    if ack_buf[0] != HANDSHAKE_ACK_BYTE {
        bail!(
            "invalid ACK byte: expected {:#x}, got {:#x}",
            HANDSHAKE_ACK_BYTE,
            ack_buf[0]
        );
    }

    debug!("Received ACK, sending payload");

    // Phase 3: Send full command request using framed protocol
    write_frame(&mut conn, &payload)
        .context("failed to write command request frame")?;

    debug!("Request sent, reading response");

    // Read initial response (contains PID)
    let frame = read_frame(&mut conn).context("failed to read initial response")?;
    let resp: AgentResponse =
        serde_json::from_slice(&frame).context("failed to parse initial response")?;

    debug!("Initial response: pid={}", resp.pid);

    Ok((conn, pipes, resp))
}

/// Wait for the final result from the agent.
///
/// Reads framed JSON responses until EOF, returning the last one which
/// contains the exit code.
pub fn wait_for_result(conn: &mut UnixStream) -> Result<AgentResponse> {
    let mut last_response: Option<AgentResponse> = None;

    loop {
        match read_frame(conn) {
            Ok(frame) => {
                let resp: AgentResponse = serde_json::from_slice(&frame)
                    .context("failed to parse agent response")?;
                debug!("Agent result received: pid={}, exit_code={}", resp.pid, resp.exit_code);
                last_response = Some(resp);
            }
            Err(e) if e.kind() == io::ErrorKind::UnexpectedEof => {
                break;
            }
            Err(e) => {
                return Err(e).context("failed to read result frame from agent");
            }
        }
    }

    last_response.ok_or_else(|| anyhow::anyhow!("no result received from agent"))
}

/// Create an OS pipe, returning (read_end, write_end) as `std::fs::File`.
fn os_pipe() -> Result<(std::fs::File, std::fs::File)> {
    let (read_fd, write_fd) = nix::unistd::pipe().context("failed to create pipe")?;
    // Convert OwnedFd into std::fs::File (consumes ownership, no unsafe needed)
    let read_file: std::fs::File = read_fd.into();
    let write_file: std::fs::File = write_fd.into();
    Ok((read_file, write_file))
}

/// Get the raw file descriptor from a `std::fs::File`.
fn raw_fd(file: &std::fs::File) -> RawFd {
    use std::os::unix::io::AsRawFd;
    file.as_raw_fd()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_write_and_read_frame() {
        let payload = b"hello, launch agent";
        let mut buf = Vec::new();
        write_frame(&mut buf, payload).unwrap();

        // Verify the buffer: 4-byte big-endian length + payload
        assert_eq!(buf.len(), 4 + payload.len());
        let len = u32::from_be_bytes([buf[0], buf[1], buf[2], buf[3]]);
        assert_eq!(len as usize, payload.len());

        let mut cursor = io::Cursor::new(buf);
        let result = read_frame(&mut cursor).unwrap();
        assert_eq!(result, payload);
    }

    #[test]
    fn test_should_not_use_agent() {
        // Headless mode
        let pd = PlatformData {
            uid: Some(501),
            gid: Some(20),
            groups: vec![],
        };
        assert!(should_not_use_agent(&pd, true));

        // No UID set
        let pd = PlatformData {
            uid: None,
            gid: None,
            groups: vec![],
        };
        assert!(should_not_use_agent(&pd, false));

        // Root user
        let pd = PlatformData {
            uid: Some(0),
            gid: Some(0),
            groups: vec![],
        };
        assert!(should_not_use_agent(&pd, false));

        // Normal multiuser case - should use agent
        let pd = PlatformData {
            uid: Some(501),
            gid: Some(20),
            groups: vec![],
        };
        assert!(!should_not_use_agent(&pd, false));
    }

    #[test]
    fn test_command_request_serialization() {
        let req = CommandRequest {
            path: "/bin/echo".to_string(),
            args: vec!["/bin/echo".to_string(), "hello".to_string()],
            env: vec!["PATH=/usr/bin".to_string()],
            dir: "/tmp".to_string(),
            stdin: false,
            stdout: true,
            stderr: true,
            setctty: false,
            setpgid: true,
            setsid: false,
        };

        let json = serde_json::to_string(&req).unwrap();
        let deserialized: CommandRequest = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.path, "/bin/echo");
        assert_eq!(deserialized.args.len(), 2);
        assert!(deserialized.stdout);
        assert!(deserialized.setpgid);
    }

    #[test]
    fn test_fd_handshake_serialization() {
        let handshake = FDHandshake {
            num_fds: 2,
            payload_size: 256,
        };

        let json = serde_json::to_string(&handshake).unwrap();
        let deserialized: FDHandshake = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.num_fds, 2);
        assert_eq!(deserialized.payload_size, 256);
    }

    #[test]
    fn test_agent_response_deserialization() {
        // Test PascalCase field names (matching Go JSON output)
        let json = r#"{"Pid": 12345, "ExitCode": 0, "Aborted": false}"#;
        let resp: AgentResponse = serde_json::from_str(json).unwrap();
        assert_eq!(resp.pid, 12345);
        assert_eq!(resp.exit_code, 0);
        assert!(!resp.aborted);
    }
}
