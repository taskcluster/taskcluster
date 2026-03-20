//! Error reporting via worker-runner protocol.
//!
//! Sends error reports to worker-runner when the "error-report" capability
//! has been negotiated. This is a faithful port of the Go
//! `errorreport/errorreport.go` package.

use std::collections::HashMap;

use crate::workerproto::Protocol;

/// Send an error report via the worker-runner protocol.
///
/// If the protocol has not negotiated the "error-report" capability, this
/// function is a no-op. The `message` is formatted with `Display` and sent
/// as the description. `debug_info` is attached as the `extra` map.
pub fn send(
    proto: &mut Protocol,
    message: &dyn std::fmt::Display,
    debug_info: &HashMap<String, String>,
) {
    if !proto.has_capability("error-report") {
        return;
    }

    let title = "generic-worker error";
    let description = format!("{}", message);
    // could support differentiating for panics
    let kind = "worker-error";

    // Convert debug_info from HashMap<String, String> to serde_json::Value map
    let extra: serde_json::Value = serde_json::Value::Object(
        debug_info
            .iter()
            .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
            .collect(),
    );

    let msg = crate::workerproto::Message::new("error-report")
        .with_property("description", serde_json::Value::String(description))
        .with_property("kind", serde_json::Value::String(kind.to_string()))
        .with_property("title", serde_json::Value::String(title.to_string()))
        .with_property("extra", extra);

    if let Err(e) = proto.send(&msg) {
        tracing::warn!("Failed to send error report via protocol: {e}");
    }
}
