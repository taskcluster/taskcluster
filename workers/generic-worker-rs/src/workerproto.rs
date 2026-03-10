//! Worker-runner protocol implementation.
//!
//! Implements the line-based JSON protocol used to communicate with
//! worker-runner over stdin/stdout pipes. Messages are prefixed with `~`.

use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};

const PROTOCOL_PREFIX: &str = "~";

/// A protocol message exchanged with worker-runner.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    #[serde(rename = "type")]
    pub msg_type: String,
    #[serde(default)]
    pub properties: HashMap<String, serde_json::Value>,
}

impl Message {
    pub fn new(msg_type: &str) -> Self {
        Self {
            msg_type: msg_type.to_string(),
            properties: HashMap::new(),
        }
    }

    pub fn with_property(mut self, key: &str, value: serde_json::Value) -> Self {
        self.properties.insert(key.to_string(), value);
        self
    }
}

/// Protocol handler for worker-runner communication.
pub struct Protocol {
    reader: BufReader<Box<dyn std::io::Read + Send>>,
    writer: Box<dyn Write + Send>,
    capabilities: Vec<String>,
}

impl Protocol {
    /// Create a new protocol handler from reader/writer.
    pub fn new(
        reader: Box<dyn std::io::Read + Send>,
        writer: Box<dyn Write + Send>,
    ) -> Self {
        Self {
            reader: BufReader::new(reader),
            writer,
            capabilities: Vec::new(),
        }
    }

    /// Create a protocol handler connected to stdin/stdout (fd 3/4 in Go).
    pub fn from_stdio() -> Result<Self> {
        // In the Go implementation, worker-runner communicates via fd 3 and fd 4.
        // In Rust, we use stdin/stdout as a simplification for now.
        // The actual implementation would open file descriptors 3 and 4.
        Ok(Self::new(
            Box::new(std::io::stdin()),
            Box::new(std::io::stdout()),
        ))
    }

    /// Start the protocol by exchanging hello messages.
    pub fn start(&mut self) -> Result<()> {
        // Read hello from worker-runner
        let msg = self.receive()?;
        if msg.msg_type != "hello" {
            anyhow::bail!("expected 'hello' message, got '{}'", msg.msg_type);
        }

        // Extract capabilities
        if let Some(caps) = msg.properties.get("capabilities") {
            if let Some(arr) = caps.as_array() {
                self.capabilities = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(String::from))
                    .collect();
            }
        }

        // Send our hello
        let hello = Message::new("hello").with_property(
            "capabilities",
            serde_json::json!(["graceful-termination", "new-credentials"]),
        );
        self.send(&hello)?;

        Ok(())
    }

    /// Send a message.
    pub fn send(&mut self, msg: &Message) -> Result<()> {
        let json = serde_json::to_string(msg)?;
        writeln!(self.writer, "{}{}", PROTOCOL_PREFIX, json)?;
        self.writer.flush()?;
        Ok(())
    }

    /// Receive a message.
    pub fn receive(&mut self) -> Result<Message> {
        let mut line = String::new();
        loop {
            line.clear();
            let bytes = self.reader.read_line(&mut line)?;
            if bytes == 0 {
                anyhow::bail!("protocol connection closed");
            }

            let trimmed = line.trim();
            if let Some(json_str) = trimmed.strip_prefix(PROTOCOL_PREFIX) {
                let msg: Message = serde_json::from_str(json_str)?;
                return Ok(msg);
            }
            // Non-protocol lines are ignored (they're regular log output)
        }
    }

    /// Check if a capability was negotiated.
    pub fn has_capability(&self, cap: &str) -> bool {
        self.capabilities.iter().any(|c| c == cap)
    }

    /// Send a "graceful-termination" capability registration.
    pub fn register_graceful_termination(&mut self) -> Result<()> {
        if self.has_capability("graceful-termination") {
            tracing::info!("Worker-runner supports graceful termination");
        }
        Ok(())
    }
}
