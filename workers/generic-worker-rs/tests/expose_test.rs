//! Expose module tests ported from the Go generic-worker's expose/*_test.go.
//!
//! These tests exercise the LocalExposer's HTTP reverse proxy and TCP port
//! forwarding directly, without requiring a running worker or mock queue.

use std::net::{IpAddr, Ipv4Addr};

use tokio::net::TcpListener as TokioTcpListener;

// ---------------------------------------------------------------------------
// Test helpers (ported from expose/helpers_for_test.go)
// ---------------------------------------------------------------------------

/// Start a simple HTTP server on an ephemeral port that responds with `body`
/// and the given `status_code`. Returns (port, join_handle).
async fn start_http_server(status_code: u16, body: &'static str) -> (u16, tokio::task::JoinHandle<()>) {
    let listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let handle = tokio::spawn(async move {
        // Accept one connection and send a fixed response.
        if let Ok((mut stream, _)) = listener.accept().await {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let mut buf = vec![0u8; 4096];
            let _ = stream.read(&mut buf).await;

            let response = format!(
                "HTTP/1.1 {} {}\r\ncontent-length: {}\r\ncontent-type: text/plain\r\n\r\n{}",
                status_code,
                match status_code {
                    200 => "OK",
                    404 => "Not Found",
                    _ => "Unknown",
                },
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes()).await;
        }
    });

    (port, handle)
}

// ---------------------------------------------------------------------------
// Expose tests
// ---------------------------------------------------------------------------

/// Port of TestLocalExposeHTTP from expose/local_test.go.
///
/// Creates a LocalExposer, exposes a simple HTTP server, and verifies the
/// proxied response contains the expected body and status code.
#[tokio::test]
async fn test_local_expose_http() {
    use generic_worker::expose::{Exposer, LocalExposer};

    let (target_port, _server_handle) = start_http_server(200, "Hello, world").await;

    let exposer = LocalExposer::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), 0);

    let exposure = exposer.expose_http(target_port).await.unwrap();
    let url = exposure.get_url();

    // Verify URL structure.
    assert_eq!(url.scheme(), "http");
    assert_eq!(url.host_str().unwrap(), "127.0.0.1");
    // The exposed port should differ from the target port (it is random).
    let exposed_port: u16 = url.port().unwrap();
    assert_ne!(exposed_port, target_port, "Exposed port should differ from target port");

    // Make an HTTP request through the proxy.
    let resp = reqwest::get(url.as_str()).await.unwrap();
    assert_eq!(resp.status().as_u16(), 200, "Expected 200 response via proxy");
    let text = resp.text().await.unwrap();
    assert_eq!(text, "Hello, world", "Expected greeting via proxy");

    exposure.close().unwrap();
}

/// Port of TestPortForward from expose/portforward_test.go.
///
/// Sets up TCP port forwarding via LocalExposer.expose_tcp_port and verifies
/// that data sent through the forwarded port reaches a TCP echo server and
/// comes back correctly. The expose_tcp_port uses a WebSocket-to-TCP bridge,
/// so this test connects as a WebSocket client.
#[tokio::test]
async fn test_port_forward() {
    use futures_util::{SinkExt, StreamExt};
    use generic_worker::expose::{Exposer, LocalExposer};
    use tokio_tungstenite::tungstenite::protocol::Message;

    // Start a tokio-based TCP echo server on a random port.
    let echo_listener = TokioTcpListener::bind("127.0.0.1:0").await.unwrap();
    let echo_port = echo_listener.local_addr().unwrap().port();

    let echo_handle = tokio::spawn(async move {
        if let Ok((mut stream, _)) = echo_listener.accept().await {
            let (mut reader, mut writer) = stream.split();
            let _ = tokio::io::copy(&mut reader, &mut writer).await;
        }
    });

    let exposer = LocalExposer::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), 0);

    let exposure = exposer.expose_tcp_port(echo_port).await.unwrap();
    let url = exposure.get_url();

    // Give the forwarder a moment to start accepting.
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Connect to the forwarded port via WebSocket (ws:// URL).
    let (mut ws_stream, _response) = tokio_tungstenite::connect_async(url.as_str())
        .await
        .expect("Failed to connect WebSocket to forwarded port");

    // Send a binary message through the WebSocket bridge.
    ws_stream
        .send(Message::Binary(b"Hello!".to_vec()))
        .await
        .expect("Failed to send WebSocket message");

    // Read back the echoed response.
    let response = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        ws_stream.next(),
    )
    .await
    .expect("Timeout waiting for echo response")
    .expect("Stream ended unexpectedly")
    .expect("WebSocket read error");

    match response {
        Message::Binary(data) => {
            assert_eq!(data, b"Hello!", "Expected echo of sent data");
        }
        other => panic!("Expected Binary message, got {:?}", other),
    }

    // Close the WebSocket cleanly.
    let _ = ws_stream.close(None).await;

    // Give the echo server time to see the close.
    tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    echo_handle.abort();

    exposure.close().unwrap();
}

/// Port of TestBasicProxying from expose/proxy_test.go.
///
/// Tests that a simple HTTP GET request is correctly proxied through the
/// LocalExposer's HTTP reverse proxy, returning status 200 and the expected body.
#[tokio::test]
async fn test_basic_proxying() {
    use generic_worker::expose::{Exposer, LocalExposer};

    let (target_port, _server_handle) = start_http_server(200, "Hello, client").await;

    let exposer = LocalExposer::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), 0);
    let exposure = exposer.expose_http(target_port).await.unwrap();
    let url = exposure.get_url();

    let resp = reqwest::get(url.as_str()).await.unwrap();
    assert_eq!(resp.status().as_u16(), 200, "Expected 200 via proxy");

    let body = resp.text().await.unwrap();
    assert_eq!(body, "Hello, client", "Body should match upstream");

    exposure.close().unwrap();
}

/// Port of TestBasicProxyingNon200 from expose/proxy_test.go.
///
/// Tests that a non-200 response code is correctly forwarded through the proxy.
#[tokio::test]
async fn test_basic_proxying_non_200() {
    use generic_worker::expose::{Exposer, LocalExposer};

    let (target_port, _server_handle) = start_http_server(404, "Didn't find that").await;

    let exposer = LocalExposer::new(IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1)), 0);
    let exposure = exposer.expose_http(target_port).await.unwrap();
    let url = exposure.get_url();

    let resp = reqwest::get(url.as_str()).await.unwrap();
    assert_eq!(resp.status().as_u16(), 404, "Expected 404 via proxy");

    let body = resp.text().await.unwrap();
    assert_eq!(body, "Didn't find that", "Body should match upstream 404 response");

    exposure.close().unwrap();
}
