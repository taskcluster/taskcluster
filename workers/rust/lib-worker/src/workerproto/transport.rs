use crate::workerproto::Message;
use futures::sink::SinkExt;
use tokio::io::{AsyncRead, AsyncWrite};
use tokio_stream::StreamExt;
use tokio_util::codec::{FramedRead, FramedWrite, LinesCodec};

/// A Transport carries messaes to and fro over [`AsyncRead`] and [`AsyncWrite`] implementations.
pub struct Transport<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> {
    framed_read: FramedRead<R, LinesCodec>,
    framed_write: FramedWrite<W, LinesCodec>,
}

impl<R: AsyncRead + Unpin, W: AsyncWrite + Unpin> Transport<R, W> {
    pub fn new(read: R, write: W) -> Self {
        Self {
            framed_read: FramedRead::new(read, LinesCodec::new()),
            framed_write: FramedWrite::new(write, LinesCodec::new()),
        }
    }

    /// Read a single message from the transport, returning None on EOF.
    pub async fn recv(&mut self) -> Option<Message> {
        self.framed_read
            .next()
            .await
            .and_then(|str_res| match str_res {
                Ok(msg_str) => Some(Message::from(msg_str)),
                // Turn errors into an EOF, printing the error to stderr, to avoid setting
                // up some kind of loop with worker-runner by writing to the pipe.
                Err(e) => {
                    eprintln!("Error reading from worker-runner: {}", e);
                    None
                }
            })
    }

    /// Write a message to the transport.
    pub async fn send(&mut self, msg: Message) {
        match self.framed_write.send(msg.to_string()).await {
            Ok(_) => {}
            Err(e) => {
                // log the error to stderr, as in `recv` above
                eprintln!("Error writing to worker-runner: {}", e);
            }
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use std::fmt::Write;
    use std::io::Cursor;

    fn lines(lines: Vec<&str>) -> Vec<u8> {
        let mut res = String::new();
        for line in lines {
            writeln!(res, "{}", line).unwrap();
        }
        res.as_bytes().to_vec()
    }

    #[tokio::test]
    async fn test_read() {
        let readable = Cursor::new(lines(vec![
            r#"~{"type": "hello", "capabilities": ["abc"]}"#,
            r#"~{"type": "shutdown"}"#,
        ]));
        let writable = Cursor::new(Vec::new());

        let mut tport = Transport::new(readable, writable);

        assert_eq!(
            tport.recv().await,
            Some(Message::Hello {
                capabilities: vec!["abc".into()]
            })
        );
        assert_eq!(tport.recv().await, Some(Message::Shutdown));
        assert_eq!(tport.recv().await, None);
        assert_eq!(tport.recv().await, None);
    }

    #[tokio::test]
    async fn test_write() {
        let readable = Cursor::new(Vec::new());
        let writable = Cursor::new(Vec::new());

        let mut tport = Transport::new(readable, writable);

        tport.send(Message::Shutdown).await;

        let writable = tport.framed_write.into_inner().into_inner();

        // note that we use Shutdown because it's the only message with a stable
        // JSON representation; everything else will have randomized property
        // order.
        assert_eq!(
            String::from_utf8_lossy(&writable).as_ref(),
            "~{\"type\":\"shutdown\"}\n"
        );
    }
}
