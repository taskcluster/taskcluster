use super::factory::AsyncWriterFactory;
use anyhow::Result;
use sha2::{Digest, Sha256, Sha512};
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use tokio::io::AsyncWrite;

/// A hasher reader factory wraps an AsyncWriterFactory in such a way that it will capture hashes of
/// the content, making those hashes available once at least one complete read-through of the data
/// is complete.
pub(super) struct HasherAsyncWriterFactory<'f, AWF: AsyncWriterFactory> {
    /// the underlying writer factory
    writer_factory: &'f mut AWF,

    /// the latest hasher, created in the last `writer_factory` call.
    latest_hasher: Option<Arc<Hasher>>,
}

impl<'f, AWF: AsyncWriterFactory> HasherAsyncWriterFactory<'f, AWF> {
    pub(super) fn new(writer_factory: &'f mut AWF) -> Self {
        Self {
            writer_factory,
            latest_hasher: None,
        }
    }

    pub(super) async fn get_writer<'a>(&'a mut self) -> Result<Box<dyn AsyncWrite + Unpin + 'a>> {
        let writer = self.writer_factory.get_writer().await?;
        let hasher = Arc::new(Hasher::new());
        self.latest_hasher = Some(hasher.clone());

        Ok(Box::new(HashingAsyncWrite {
            inner: writer,
            hasher,
        }))
    }

    /// Get the hashes determined from the latest writer.
    ///
    /// ## Panics
    ///
    /// This function should only be called after a successful upload from a writer.  It will panic
    /// if called without first calling `get_writer`.
    pub(super) fn hashes(&self) -> HashMap<String, String> {
        let hasher = self
            .latest_hasher
            .as_ref()
            .expect("no previous calls to get_writer");
        hasher.hashes()
    }
}

/// A hasher hashes data and makes the results available as a HashMap
struct Hasher(Mutex<HasherInner>);

struct HasherInner {
    sha256: Sha256,
    sha512: Sha512,
}

impl Hasher {
    fn new() -> Self {
        Self(Mutex::new(HasherInner {
            sha256: Sha256::new(),
            sha512: Sha512::new(),
        }))
    }

    fn update(&self, buf: &[u8]) {
        let mut inner = self.0.lock().unwrap();
        inner.sha256.update(buf);
        inner.sha512.update(buf);
    }

    fn hashes(&self) -> HashMap<String, String> {
        let mut inner = self.0.lock().unwrap();

        let mut result = HashMap::new();
        result.insert(
            "sha256".into(),
            format!("{:x}", inner.sha256.finalize_reset()),
        );
        result.insert(
            "sha512".into(),
            format!("{:x}", inner.sha512.finalize_reset()),
        );
        result
    }
}

/// Wraper for an AsyncWrite that will also call a hasher with every chunk written
struct HashingAsyncWrite<AW: AsyncWrite + Unpin> {
    inner: AW,
    hasher: Arc<Hasher>,
}

impl<AW: AsyncWrite + Unpin> AsyncWrite for HashingAsyncWrite<AW> {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        let res = Pin::new(&mut self.inner).poll_write(cx, buf);
        if let Poll::Ready(Ok(size)) = res {
            // update the hashes with the bytes successfully written
            self.hasher.update(&buf[..size]);
        }
        res
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}
