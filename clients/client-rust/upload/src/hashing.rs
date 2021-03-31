use super::factory::AsyncReaderFactory;
use anyhow::Result;
use serde_json::{json, Value};
use sha2::{Digest, Sha256, Sha512};
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};
use tokio::io::{AsyncRead, ReadBuf};

/// A hasher rader factory wraps an AsyncReaderFactory in such a way that it will capture hashes of
/// the content, making those hashes available once at least one complete read-through of the data
/// is complete.
pub(super) struct HasherAsyncReaderFactory<ARF: AsyncReaderFactory> {
    /// the underlying reader factory
    reader_factory: ARF,

    /// the latest hasher, created in the last `reader_factory` call.
    latest_hasher: Option<Arc<Hasher>>,
}

impl<ARF: AsyncReaderFactory> HasherAsyncReaderFactory<ARF> {
    pub(super) fn new(reader_factory: ARF) -> Self {
        Self {
            reader_factory,
            latest_hasher: None,
        }
    }

    pub(super) async fn get_reader(
        &mut self,
    ) -> Result<Box<dyn AsyncRead + Sync + Send + Unpin + 'static>> {
        let reader = self.reader_factory.get_reader().await?;
        let hasher = Arc::new(Hasher::new());
        self.latest_hasher = Some(hasher.clone());

        Ok(Box::new(HashingAsyncRead {
            inner: reader,
            hasher,
        }))
    }

    /// Get the hashes determined from the latest reader.
    ///
    /// ## Panics
    ///
    /// This function should only be called after a successful upload from a reader.  It will panic
    /// if called without first calling `get_reader`, or called when fewer than `content_length`
    /// bytes have been read.
    pub(super) fn hashes(&self, content_length: u64) -> Value {
        let hasher = self
            .latest_hasher
            .as_ref()
            .expect("no previous calls to get_reader");
        hasher.hashes(content_length)
    }
}

/// A hasher hashes data and makes the results available in a [`serde_json::Value`].
struct Hasher(Mutex<HasherInner>);

struct HasherInner {
    sha256: Sha256,
    sha512: Sha512,
    bytes: u64,
}

impl Hasher {
    fn new() -> Self {
        Self(Mutex::new(HasherInner {
            sha256: Sha256::new(),
            sha512: Sha512::new(),
            bytes: 0,
        }))
    }

    fn update(&self, buf: &[u8]) {
        let mut inner = self.0.lock().unwrap();
        inner.sha256.update(buf);
        inner.sha512.update(buf);
        inner.bytes += buf.len() as u64;
    }

    fn hashes(&self, content_length: u64) -> Value {
        let mut inner = self.0.lock().unwrap();
        if inner.bytes != content_length {
            panic!(
                "hasher hashed {} bytes, not matching content_length {}",
                inner.bytes, content_length
            );
        }
        json!({
            "sha256": format!("{:x}", inner.sha256.finalize_reset()),
            "sha512": format!("{:x}", inner.sha512.finalize_reset()),
        })
    }
}

/// Wraper for an AsyncRead that will also call a hasher with every chunk read
struct HashingAsyncRead<AR: AsyncRead + Unpin> {
    inner: AR,
    hasher: Arc<Hasher>,
}

impl<AR: AsyncRead + Unpin> AsyncRead for HashingAsyncRead<AR> {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        // poll_read appends data to the buffer, so we must examine the length
        // before and after to see how much data has been added
        let len_before = buf.filled().len();
        let res = Pin::new(&mut self.inner).poll_read(cx, buf);
        if matches!(res, Poll::Ready(Ok(()))) {
            // update the hashes with any *new* bytes
            self.hasher.update(&buf.filled()[len_before..]);
        }
        res
    }
}
