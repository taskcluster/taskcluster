use crate::workerproto::{Capabilities, Capability, Message, Transport};
use tokio::io::{AsyncRead, AsyncWrite};

pub struct Protocol<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> {
    /// The transport carrying the messages
    transport: Transport<R, W>,

    /// Capabilities shared by both ends of this connection (or, before [`Protocol::negotiate`],
    /// present at this end)
    capabilities: Capabilities,
}

impl<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> Protocol<R, W> {
    /// Create a new protocol instance.  This will contain only the local
    /// capabilities until `negotiate` has returned.
    pub fn new(transport: Transport<R, W>, capabilities: Capabilities) -> Self {
        Self {
            transport,
            capabilities,
        }
    }

    /// Negotiate capabilities with the remote end.  This assumes this end of the
    /// connection is the worker.
    pub async fn negotiate(&mut self) -> anyhow::Result<()> {
        if let Some(msg) = self.transport.recv().await {
            if let msg @ Message::Welcome { .. } = msg {
                let remote_caps = Capabilities::from_message(&msg);
                self.capabilities = self.capabilities.intersection(&remote_caps);
                let hello = self.capabilities.hello_message();
                self.transport.send(hello).await;
            } else {
                anyhow::bail!("Recevied unexpected message {} from worker-runner", msg);
            }
        } else {
            anyhow::bail!("Did not receive a welcome message from worker-runner");
        }
        Ok(())
    }

    /// Determine whether this capability is present.
    pub fn capable(&self, cap: Capability) -> bool {
        self.capabilities.capable(cap)
    }

    /// Get the protocol's capabilities
    pub fn capabilities(&self) -> Capabilities {
        self.capabilities.clone()
    }

    /// Send a message over this protocol
    pub async fn send(&mut self, message: Message) {
        self.transport.send(message).await
    }

    /// Receive a message over this protocol
    pub async fn recv(&mut self) -> Option<Message> {
        self.transport.recv().await
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use std::io::Cursor;

    #[tokio::test]
    async fn test_negotiation() {
        let readable = Cursor::new(
            b"~{\"type\": \"welcome\", \"capabilities\": [\"log\", \"graceful-termination\", \"abc\"]}\n",
        );
        let writable = Cursor::new(Vec::new());

        let mut proto = Protocol::new(
            Transport::new(readable, writable),
            Capabilities::from_capabilities(&[Capability::Log]),
        );
        proto.negotiate().await.unwrap();

        assert!(proto.capable(Capability::Log));
        assert!(!proto.capable(Capability::GracefulTermination));
    }
}
