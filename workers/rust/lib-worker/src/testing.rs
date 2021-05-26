//! This module contains support for testing workers.

use crate::execute::{ExecutionContext, Executor, Payload, Success};
use crate::log::{TaskLog, TaskLogSink};
use crate::task::Task;
use crate::tc::{QueueService, ServiceFactory};
use async_trait::async_trait;
use bytes::{Bytes, BytesMut};
use slog::{o, Drain, Logger};
use std::sync::{Arc, Mutex};

/// The result of a call to [`execute_task`].
pub struct TestExecutionResult {
    pub success: Success,
    pub task_log: Bytes,
}

struct TestTaskLog(Arc<Mutex<BytesMut>>);

impl TestTaskLog {
    fn new() -> Self {
        Self(Arc::new(Mutex::new(BytesMut::new())))
    }

    fn task_log(&self) -> TaskLog {
        TaskLog::new(Self(self.0.clone()))
    }

    fn bytes(&self) -> Bytes {
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

/// Execute a single task in the given executor.
pub async fn execute_task<P: Payload, E: Executor<P>>(
    executor: E,
    task_def: Task,
    service_factory: Arc<dyn ServiceFactory>,
) -> anyhow::Result<TestExecutionResult> {
    let decorator = slog_term::PlainSyncDecorator::new(slog_term::TestStdoutWriter);
    let drain = slog_term::FullFormat::new(decorator).build().fuse();
    let logger = Logger::root(drain, o!());

    let payload = P::from_value(task_def.payload.clone()).expect("test payload invalid");

    let test_task_log = TestTaskLog::new();

    let ctx = ExecutionContext {
        task_id: "R6ta4hSOR1izWgW3S9Fa5g".to_owned(),
        run_id: 0,
        task_def,
        payload,
        logger,
        service_factory,
        task_log: test_task_log.task_log(),
    };

    let success = executor.execute(ctx).await?;

    Ok(TestExecutionResult {
        success,
        task_log: test_task_log.bytes(),
    })
}

/// An implementation of ServiceFactory that just returns the same value every time, and
/// returns a fake root URL.  This is used for testing, and is only avaliable in debug builds.
#[derive(Default)]
pub struct TestServiceFactory {
    pub queue: Option<Arc<dyn QueueService>>,
}

impl ServiceFactory for TestServiceFactory {
    fn root_url(&self) -> String {
        "https://tc-tests.example.com".to_owned()
    }

    /// Get an implementation of the Queue service
    fn queue(&self) -> anyhow::Result<Arc<dyn QueueService>> {
        if let Some(ref queue) = self.queue {
            Ok(queue.clone())
        } else {
            anyhow::bail!("No test queue instance defined")
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use serde::Deserialize;
    use serde_json::json;

    /// Test a simple immediate-success executor.  This also serves as an example of how to use
    /// [`execute_task`]
    #[tokio::test]
    async fn success_test() {
        #[derive(Deserialize)]
        struct Payload {
            success: bool,
        }

        struct SimpleExecutor;

        #[async_trait]
        impl Executor<Payload> for SimpleExecutor {
            async fn execute(
                &self,
                ctx: ExecutionContext<Payload>,
            ) -> Result<Success, anyhow::Error> {
                ctx.task_log.writeln("I ran.").await?;
                Ok(if ctx.payload.success {
                    Success::Succeeded
                } else {
                    Success::Failed
                })
            }
        }

        let task = Task {
            payload: json!({
                "success": true
            }),
            ..Default::default()
        };

        let service_factory = TestServiceFactory {
            ..Default::default()
        };

        let result = execute_task(SimpleExecutor, task, Arc::new(service_factory))
            .await
            .unwrap();
        assert_eq!(result.success, Success::Succeeded);
        assert_eq!(result.task_log.as_ref(), b"I ran.\n");
    }
}
