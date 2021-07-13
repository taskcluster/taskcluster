use crate::log::{TaskLog, TaskLogSink};
use async_trait::async_trait;
use bytes::{Bytes, BytesMut};
use std::sync::{Arc, Mutex};

/// A [`TaskLogSink`] implementation that records the log in a buffer, for testing
pub(super) struct TestTaskLog(Arc<Mutex<BytesMut>>);

impl TestTaskLog {
    pub(super) fn new() -> Self {
        Self(Arc::new(Mutex::new(BytesMut::new())))
    }

    pub(super) fn task_log(&self) -> TaskLog {
        TaskLog::new(Self(self.0.clone()))
    }

    pub(super) fn bytes(&self) -> Bytes {
        self.0.lock().unwrap().clone().freeze()
    }
}

#[async_trait]
impl TaskLogSink for TestTaskLog {
    async fn write_all(&self, buf: Bytes) -> anyhow::Result<()> {
        self.0.lock().unwrap().extend_from_slice(buf.as_ref());
        Ok(())
    }
}
