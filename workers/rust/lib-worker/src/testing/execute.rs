use super::log::TestTaskLog;
use crate::artifact::ArtifactManager;
use crate::execute::{ExecutionContext, Executor, Payload, Success};
use crate::task::Task;
use crate::tc::ServiceFactory;
use bytes::Bytes;
use slog::{o, Drain, Logger};
use std::sync::Arc;

/// The result of a call to [`execute_task`].
pub struct TestExecutionResult {
    pub success: Success,
    pub task_log: Bytes,
}

/// Execute a single task in the given executor.  Typically this is called with a
/// [`TestServiceFactory]
pub async fn execute_task<P: Payload, E: Executor<P>>(
    executor: E,
    task_def: Task,
    artifact_manager: Arc<dyn ArtifactManager>,
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
        artifact_manager,
        service_factory,
        task_log: test_task_log.task_log(),
    };

    let success = executor.execute(ctx).await?;

    Ok(TestExecutionResult {
        success,
        task_log: test_task_log.bytes(),
    })
}
