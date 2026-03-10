//! Expose functionality - exposes local services to the network.
//!
//! Supports two modes:
//! - Local: Direct HTTP/TCP port exposure via public IP
//! - WST: WebSocket Tunnel for cloud environments
//!
//! WebSocket bridges:
//! - wsproxy: WebSocket-to-WebSocket proxy bridge for HTTP exposure with WS upgrade support
//! - ws2tcp: WebSocket-to-TCP bridge for exposing plain TCP ports over WebSocket

use anyhow::Result;
use futures_util::{SinkExt, StreamExt};
use std::net::IpAddr;
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::{watch, Mutex};
use tokio_tungstenite::tungstenite::protocol::Message;
use url::Url;

/// An exposer creates network-accessible endpoints for local services.
pub trait Exposer: Send + Sync {
    /// Expose a local HTTP server.
    fn expose_http(
        &self,
        target_port: u16,
    ) -> impl std::future::Future<Output = Result<Box<dyn Exposure>>> + Send;

    /// Expose a local TCP port.
    fn expose_tcp_port(
        &self,
        target_port: u16,
    ) -> impl std::future::Future<Output = Result<Box<dyn Exposure>>> + Send;
}

/// A network exposure of a local service.
pub trait Exposure: Send + Sync {
    /// Close the exposure.
    fn close(&self) -> Result<()>;

    /// Get the public URL for this exposure.
    fn get_url(&self) -> Url;
}

/// Local exposer that binds directly to a public IP.
pub struct LocalExposer {
    pub public_ip: IpAddr,
    pub port: u16,
}

impl LocalExposer {
    pub fn new(public_ip: IpAddr, port: u16) -> Self {
        Self { public_ip, port }
    }
}

impl Exposer for LocalExposer {
    async fn expose_http(&self, target_port: u16) -> Result<Box<dyn Exposure>> {
        let bind_addr = format!("0.0.0.0:{}", self.port);
        let listener = TcpListener::bind(&bind_addr).await?;
        let local_addr = listener.local_addr()?;
        let actual_port = local_addr.port();

        let url = Url::parse(&format!("http://{}:{}", self.public_ip, actual_port))?;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        // Spawn the reverse proxy task (with WebSocket upgrade support)
        let target = format!("http://127.0.0.1:{}", target_port);
        tokio::spawn(run_http_reverse_proxy(
            listener,
            target,
            target_port,
            shutdown_rx,
        ));

        Ok(Box::new(LocalExposure {
            url,
            shutdown_tx: Arc::new(shutdown_tx),
        }))
    }

    async fn expose_tcp_port(&self, target_port: u16) -> Result<Box<dyn Exposure>> {
        // For TCP port forwarding, bind on an ephemeral port
        let listener = TcpListener::bind("0.0.0.0:0").await?;
        let local_addr = listener.local_addr()?;
        let actual_port = local_addr.port();

        let url = Url::parse(&format!("ws://{}:{}", self.public_ip, actual_port))?;

        let (shutdown_tx, shutdown_rx) = watch::channel(false);

        // Spawn the WebSocket-to-TCP forwarder task
        tokio::spawn(run_ws2tcp_server(listener, target_port, shutdown_rx));

        Ok(Box::new(LocalExposure {
            url,
            shutdown_tx: Arc::new(shutdown_tx),
        }))
    }
}

struct LocalExposure {
    url: Url,
    shutdown_tx: Arc<watch::Sender<bool>>,
}

impl Exposure for LocalExposure {
    fn close(&self) -> Result<()> {
        // Signal shutdown to the proxy/forwarder task
        let _ = self.shutdown_tx.send(true);
        Ok(())
    }

    fn get_url(&self) -> Url {
        self.url.clone()
    }
}

// ============================================================================
// HTTP Reverse Proxy with WebSocket upgrade support (wsproxy)
// ============================================================================

/// Run an HTTP reverse proxy that forwards requests from the listener
/// to the target URL (localhost:target_port). Detects WebSocket upgrade
/// requests and bridges them via WebSocket-to-WebSocket proxy.
async fn run_http_reverse_proxy(
    listener: TcpListener,
    target_base: String,
    target_port: u16,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap_or_default();

    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, _addr)) => {
                        let client = client.clone();
                        let target_base = target_base.clone();
                        tokio::spawn(websock_compatible_handler(
                            stream, client, target_base, target_port,
                        ));
                    }
                    Err(e) => {
                        tracing::warn!("Failed to accept connection: {}", e);
                    }
                }
            }
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    tracing::debug!("HTTP reverse proxy shutting down");
                    break;
                }
            }
        }
    }
}

/// HTTP handler that detects WebSocket upgrades and bridges them to
/// ws://127.0.0.1:target_port, otherwise forwards via reverse proxy.
/// Ports the Go websockCompatibleHandlerFunc from expose/wsproxy.go.
async fn websock_compatible_handler(
    stream: tokio::net::TcpStream,
    client: reqwest::Client,
    target_base: String,
    target_port: u16,
) {
    use tokio::io::AsyncReadExt;

    // Peek at the request to determine if it's a WebSocket upgrade.
    // We need to read the full HTTP headers to check.
    let mut stream = stream;
    let mut buf = vec![0u8; 8192];

    let n = match stream.read(&mut buf).await {
        Ok(0) => return,
        Ok(n) => n,
        Err(_) => return,
    };

    let request_bytes = &buf[..n];
    let request_str = String::from_utf8_lossy(request_bytes);

    // Check for WebSocket upgrade by looking for the Upgrade: websocket header
    let is_websocket = request_str
        .lines()
        .any(|line| {
            let lower = line.to_lowercase();
            lower.starts_with("upgrade:") && lower.contains("websocket")
        });

    if is_websocket {
        tracing::debug!("WebSocket upgrade detected, bridging to ws://127.0.0.1:{}", target_port);
        // Hand the stream (with already-read bytes) to the WebSocket proxy bridge.
        // We need to reconstruct the stream with the already-read data.
        // Use the raw TCP stream for the WebSocket handshake by writing back
        // the already-read request bytes via a custom approach.
        //
        // Since we already consumed the bytes, we use tokio_tungstenite's
        // server accept on a stream that replays the buffered data.
        let replay_stream = ReplayStream::new(stream, buf[..n].to_vec());
        if let Err(e) = websocket_proxy_bridge(replay_stream, target_port, &request_str).await {
            tracing::debug!("WebSocket bridge closed: {}", e);
        }
        return;
    }

    // Not a WebSocket upgrade; forward via reverse proxy.
    handle_http_connection_with_bytes(stream, client, target_base, request_bytes, &request_str)
        .await;
}

/// A wrapper stream that replays buffered bytes before reading from the inner stream.
/// This is needed because we already consumed bytes from the TCP stream to detect
/// WebSocket upgrades.
struct ReplayStream {
    inner: tokio::net::TcpStream,
    buffer: Vec<u8>,
    pos: usize,
}

impl ReplayStream {
    fn new(inner: tokio::net::TcpStream, buffer: Vec<u8>) -> Self {
        Self {
            inner,
            buffer,
            pos: 0,
        }
    }
}

impl tokio::io::AsyncRead for ReplayStream {
    fn poll_read(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        // First drain the replay buffer
        if self.pos < self.buffer.len() {
            let remaining = &self.buffer[self.pos..];
            let to_copy = remaining.len().min(buf.remaining());
            buf.put_slice(&remaining[..to_copy]);
            self.pos += to_copy;
            return std::task::Poll::Ready(Ok(()));
        }
        // Then delegate to the inner stream
        std::pin::Pin::new(&mut self.inner).poll_read(cx, buf)
    }
}

impl tokio::io::AsyncWrite for ReplayStream {
    fn poll_write(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
        buf: &[u8],
    ) -> std::task::Poll<std::io::Result<usize>> {
        std::pin::Pin::new(&mut self.inner).poll_write(cx, buf)
    }

    fn poll_flush(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(
        mut self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> std::task::Poll<std::io::Result<()>> {
        std::pin::Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

impl Unpin for ReplayStream {}

/// Bridge a viewer WebSocket connection to a tunnel WebSocket connection at
/// ws://127.0.0.1:target_port. Ports the Go bridgeConn/copyWsData from
/// expose/wsproxy.go.
async fn websocket_proxy_bridge(
    viewer_stream: ReplayStream,
    target_port: u16,
    _request_str: &str,
) -> Result<()> {
    // Accept the viewer's WebSocket upgrade on the replayed stream
    let viewer_ws = tokio_tungstenite::accept_async(viewer_stream)
        .await
        .map_err(|e| anyhow::anyhow!("could not upgrade client connection: {}", e))?;

    // Connect to the tunnel target
    let tunnel_url = format!("ws://127.0.0.1:{}", target_port);
    let (tunnel_ws, _response) = tokio_tungstenite::connect_async(&tunnel_url)
        .await
        .map_err(|e| anyhow::anyhow!("could not dial tunnel at {}: {}", tunnel_url, e))?;

    tracing::debug!("initiating WebSocket connection bridge");

    // Bridge the two WebSocket connections bidirectionally
    bridge_conn(viewer_ws, tunnel_ws).await
}

/// Bidirectional WebSocket bridge with ping/pong forwarding.
/// Ports the Go bridgeConn from expose/wsproxy.go.
async fn bridge_conn<S1, S2>(conn1: S1, conn2: S2) -> Result<()>
where
    S1: StreamExt<Item = std::result::Result<Message, tokio_tungstenite::tungstenite::Error>>
        + SinkExt<Message>
        + Send
        + Unpin
        + 'static,
    S2: StreamExt<Item = std::result::Result<Message, tokio_tungstenite::tungstenite::Error>>
        + SinkExt<Message>
        + Send
        + Unpin
        + 'static,
{
    let (write1, read1) = conn1.split();
    let (write2, read2) = conn2.split();

    let write1 = Arc::new(Mutex::new(write1));
    let write2 = Arc::new(Mutex::new(write2));

    // Copy data from conn1 -> conn2 and conn2 -> conn1 concurrently.
    // When either direction ends, we close both.
    let w2_clone = write2.clone();
    let w1_clone = write1.clone();

    let task1 = tokio::spawn(copy_ws_data(read1, w2_clone));
    let task2 = tokio::spawn(copy_ws_data(read2, w1_clone));

    // Wait for either direction to complete
    tokio::select! {
        result = task1 => {
            // conn1->conn2 finished; close conn2 write side
            let _ = write2.lock().await.close().await;
            let _ = write1.lock().await.close().await;
            match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(e),
                Err(e) => Err(anyhow::anyhow!("bridge task panicked: {}", e)),
            }
        }
        result = task2 => {
            // conn2->conn1 finished; close conn1 write side
            let _ = write1.lock().await.close().await;
            let _ = write2.lock().await.close().await;
            match result {
                Ok(Ok(())) => Ok(()),
                Ok(Err(e)) => Err(e),
                Err(e) => Err(anyhow::anyhow!("bridge task panicked: {}", e)),
            }
        }
    }
}

/// Copy messages from src to dest WebSocket, forwarding all message types
/// including ping/pong. Ports the Go copyWsData from expose/wsproxy.go.
async fn copy_ws_data<R, W>(mut src: R, dest: Arc<Mutex<W>>) -> Result<()>
where
    R: StreamExt<Item = std::result::Result<Message, tokio_tungstenite::tungstenite::Error>>
        + Unpin,
    W: SinkExt<Message> + Unpin,
{
    while let Some(msg_result) = src.next().await {
        match msg_result {
            Ok(msg) => {
                match &msg {
                    Message::Close(_) => {
                        // Forward the close and exit
                        let _ = dest.lock().await.send(msg).await;
                        return Ok(());
                    }
                    Message::Ping(data) => {
                        // Forward ping as ping (the Go code forwards control messages)
                        let _ = dest.lock().await.send(Message::Ping(data.clone())).await;
                        continue;
                    }
                    Message::Pong(data) => {
                        // Forward pong as pong
                        let _ = dest.lock().await.send(Message::Pong(data.clone())).await;
                        continue;
                    }
                    Message::Text(_) | Message::Binary(_) | Message::Frame(_) => {
                        // Forward data messages
                        if dest.lock().await.send(msg).await.is_err() {
                            return Ok(());
                        }
                    }
                }
            }
            Err(e) => {
                // Abnormal closure is expected for wsmux streams - treat
                // normal/going-away/abnormal close as non-errors, matching
                // the Go IsUnexpectedCloseError logic.
                use tokio_tungstenite::tungstenite::error::Error as WsError;
                match &e {
                    WsError::Protocol(_)
                    | WsError::ConnectionClosed
                    | WsError::AlreadyClosed => {
                        return Ok(());
                    }
                    _ => {
                        return Err(anyhow::anyhow!("websocket read error: {}", e));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Handle a single HTTP connection by proxying an already-read request.
async fn handle_http_connection_with_bytes(
    mut stream: tokio::net::TcpStream,
    client: reqwest::Client,
    target_base: String,
    request_bytes: &[u8],
    request_str: &str,
) {
    use tokio::io::AsyncWriteExt;

    // Parse the first line to get method and path
    let first_line = match request_str.lines().next() {
        Some(line) => line,
        None => return,
    };

    let parts: Vec<&str> = first_line.split_whitespace().collect();
    if parts.len() < 2 {
        return;
    }

    let method = parts[0];
    let path = parts[1];
    let target_url = format!("{}{}", target_base, path);

    // Build the proxied request
    let req_method = match method {
        "GET" => reqwest::Method::GET,
        "POST" => reqwest::Method::POST,
        "PUT" => reqwest::Method::PUT,
        "DELETE" => reqwest::Method::DELETE,
        "HEAD" => reqwest::Method::HEAD,
        "OPTIONS" => reqwest::Method::OPTIONS,
        "PATCH" => reqwest::Method::PATCH,
        _ => reqwest::Method::GET,
    };

    // Extract headers from the request
    let mut builder = client.request(req_method, &target_url);

    // Find body (after \r\n\r\n)
    if let Some(body_start) = request_str.find("\r\n\r\n") {
        let body = &request_bytes[body_start + 4..];
        if !body.is_empty() {
            builder = builder.body(body.to_vec());
        }
    }

    // Forward the request
    match builder.send().await {
        Ok(resp) => {
            let status = resp.status();
            let headers = resp.headers().clone();
            let body = resp.bytes().await.unwrap_or_default();

            // Write response back to client
            let mut response = format!(
                "HTTP/1.1 {} {}\r\n",
                status.as_u16(),
                status.canonical_reason().unwrap_or("")
            );
            for (name, value) in headers.iter() {
                if let Ok(v) = value.to_str() {
                    response.push_str(&format!("{}: {}\r\n", name, v));
                }
            }
            response.push_str(&format!("content-length: {}\r\n", body.len()));
            response.push_str("\r\n");

            let _ = stream.write_all(response.as_bytes()).await;
            let _ = stream.write_all(&body).await;
        }
        Err(e) => {
            let error_body = format!("Proxy error: {}", e);
            let response = format!(
                "HTTP/1.1 502 Bad Gateway\r\ncontent-length: {}\r\n\r\n{}",
                error_body.len(),
                error_body
            );
            let _ = stream.write_all(response.as_bytes()).await;
        }
    }
}

// ============================================================================
// WebSocket-to-TCP bridge (ws2tcp)
// ============================================================================

/// Run a WebSocket-to-TCP server that accepts WebSocket connections on the
/// listener and bridges them to localhost:target_port. Ports the Go
/// websocketToTCPHandlerFunc from expose/ws2tcp.go.
async fn run_ws2tcp_server(
    listener: TcpListener,
    target_port: u16,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((stream, _addr)) => {
                        tokio::spawn(websocket_to_tcp_handler(stream, target_port));
                    }
                    Err(e) => {
                        tracing::warn!("Failed to accept WS-to-TCP connection: {}", e);
                    }
                }
            }
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    tracing::debug!("WS-to-TCP server shutting down");
                    break;
                }
            }
        }
    }
}

/// Accepts a WebSocket connection at / and forwards binary messages
/// bidirectionally to a TCP port on localhost. Ports the Go
/// websocketToTCPHandlerFunc from expose/ws2tcp.go.
///
/// - 10s keepalive pings
/// - Binary message type only (rejects text)
/// - Mutex-protected WebSocket writes
async fn websocket_to_tcp_handler(stream: tokio::net::TcpStream, target_port: u16) {
    // Accept the WebSocket upgrade
    let ws_stream = match tokio_tungstenite::accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            tracing::warn!("Could not upgrade to WebSocket: {}", e);
            return;
        }
    };

    // Connect to the local TCP port
    let target_addr = format!("127.0.0.1:{}", target_port);
    let tcp_stream = match tokio::net::TcpStream::connect(&target_addr).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Could not connect to TCP port {}: {}", target_addr, e);
            return;
        }
    };

    let (tcp_read, tcp_write) = tcp_stream.into_split();
    let (ws_write, ws_read) = ws_stream.split();

    // Only one thing is allowed to write to the WebSocket at a time
    let ws_write = Arc::new(Mutex::new(ws_write));

    // Send keepalive pings every 10s
    let ws_write_ping = ws_write.clone();
    let ping_task = tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(10));
        loop {
            interval.tick().await;
            let mut writer = ws_write_ping.lock().await;
            if writer.send(Message::Ping(vec![])).await.is_err() {
                return;
            }
        }
    });

    // Bridge: WebSocket -> TCP (read WS messages, write to TCP)
    let ws_write_for_close = ws_write.clone();
    let ws_to_tcp = {
        let tcp_write = Arc::new(Mutex::new(tcp_write));
        let tcp_write_clone = tcp_write.clone();
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;

            let mut ws_read = ws_read;
            while let Some(msg_result) = ws_read.next().await {
                match msg_result {
                    Ok(msg) => match msg {
                        Message::Binary(data) => {
                            let mut writer = tcp_write_clone.lock().await;
                            if writer.write_all(&data).await.is_err() {
                                return;
                            }
                        }
                        Message::Text(_) => {
                            // Protocol error: we don't support Text messages.
                            // Match Go behavior: just return (close connection).
                            return;
                        }
                        Message::Close(_) => {
                            return;
                        }
                        Message::Ping(data) => {
                            // Respond with pong (mutex-protected write)
                            let mut writer = ws_write_for_close.lock().await;
                            let _ = writer.send(Message::Pong(data)).await;
                        }
                        Message::Pong(_) | Message::Frame(_) => {
                            // Ignore
                        }
                    },
                    Err(_) => {
                        // Connection closed or error
                        return;
                    }
                }
            }
        })
    };

    // Bridge: TCP -> WebSocket (read from TCP, write binary WS messages)
    let ws_write_for_tcp = ws_write.clone();
    let tcp_to_ws = tokio::spawn(async move {
        use tokio::io::AsyncReadExt;

        let mut tcp_read = tcp_read;
        // 512 KiB buffer, matching Go implementation
        let mut buf = vec![0u8; 1024 * 512];
        loop {
            match tcp_read.read(&mut buf).await {
                Ok(0) => return, // EOF
                Ok(n) => {
                    let data = buf[..n].to_vec();
                    let mut writer = ws_write_for_tcp.lock().await;
                    if writer.send(Message::Binary(data)).await.is_err() {
                        return;
                    }
                }
                Err(_) => return,
            }
        }
    });

    // Wait for either direction to finish, then tear down everything
    tokio::select! {
        _ = ws_to_tcp => {}
        _ = tcp_to_ws => {}
    }

    // Tear down: abort the ping task and close the WebSocket
    ping_task.abort();
    let _ = ws_write.lock().await.close().await;
}

// ============================================================================
// TCP port forwarding (used by WST HTTP exposure)
// ============================================================================

/// Run a TCP port forwarder that accepts connections on the listener
/// and forwards them bidirectionally to localhost:target_port.
/// Used by WST HTTP exposure where connections arrive as plain TCP.
pub async fn run_tcp_port_forwarder(
    listener: TcpListener,
    target_port: u16,
    mut shutdown_rx: watch::Receiver<bool>,
) {
    loop {
        tokio::select! {
            accept_result = listener.accept() => {
                match accept_result {
                    Ok((inbound, _addr)) => {
                        tokio::spawn(forward_tcp_connection(inbound, target_port));
                    }
                    Err(e) => {
                        tracing::warn!("Failed to accept TCP connection: {}", e);
                    }
                }
            }
            _ = shutdown_rx.changed() => {
                if *shutdown_rx.borrow() {
                    tracing::debug!("TCP port forwarder shutting down");
                    break;
                }
            }
        }
    }
}

/// Forward a single TCP connection bidirectionally to localhost:target_port.
async fn forward_tcp_connection(inbound: tokio::net::TcpStream, target_port: u16) {
    let target_addr = format!("127.0.0.1:{}", target_port);
    let outbound = match tokio::net::TcpStream::connect(&target_addr).await {
        Ok(stream) => stream,
        Err(e) => {
            tracing::warn!("Failed to connect to target {}: {}", target_addr, e);
            return;
        }
    };

    let (mut in_read, mut in_write) = inbound.into_split();
    let (mut out_read, mut out_write) = outbound.into_split();

    let client_to_server = async {
        let _ = tokio::io::copy(&mut in_read, &mut out_write).await;
    };

    let server_to_client = async {
        let _ = tokio::io::copy(&mut out_read, &mut in_write).await;
    };

    // Run both copy directions concurrently; when either finishes, we're done
    tokio::select! {
        _ = client_to_server => {}
        _ = server_to_client => {}
    }
}

// ============================================================================
// WebSocket Tunnel exposer for cloud environments
// ============================================================================

/// WebSocket Tunnel exposer for cloud environments.
pub struct WstExposer {
    pub server_url: String,
    pub wst_audience: String,
    pub worker_group: String,
    pub worker_id: String,
}

impl Exposer for WstExposer {
    async fn expose_http(&self, _target_port: u16) -> Result<Box<dyn Exposure>> {
        // TODO: Establish WST connection and return exposure
        anyhow::bail!("WST exposure not yet implemented")
    }

    async fn expose_tcp_port(&self, _target_port: u16) -> Result<Box<dyn Exposure>> {
        anyhow::bail!("WST TCP exposure not yet implemented")
    }
}
