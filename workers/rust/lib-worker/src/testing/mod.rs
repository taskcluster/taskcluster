/*! This module contains support for testing workers.

## Example

```rust
use taskcluster_lib_worker::execute::{ExecutionContext, Executor, Success};
use taskcluster_lib_worker::testing::{execute_task, TestArtifactManager, TestServiceFactory};
use taskcluster_lib_worker::task::Task;
use bytes::Bytes;
use async_trait::async_trait;
use serde::Deserialize;
use serde_json::json;

/// A simple immediate-success executor.
struct SimpleExecutor;

#[derive(Deserialize)]
struct Payload {
    success: bool,
}

#[async_trait]
impl Executor<Payload> for SimpleExecutor {
    async fn execute(
        &self,
        ctx: ExecutionContext<Payload>,
    ) -> Result<Success, anyhow::Error> {
        // try logging..
        ctx.task_log.writeln("I ran.").await?;

        // try creating an artifact
        ctx.artifact_manager
            .create_artifact_from_buf(
                "public/info.txt",
                "text/plain",
                ctx.task_def.expires,
                b"Hello, world.",
            )
            .await?;

        Ok(if ctx.payload.success {
            Success::Succeeded
        } else {
            Success::Failed
        })
    }
}

#[tokio::main] // or #[tokio::test] for a test case
async fn main() {
    // build a payload for this worker
    let task = Task {
        payload: json!({
            "success": true
        }),
        ..Default::default()
    };

    // set up testing versions of the context
    let artifact_manager = TestArtifactManager::new();
    let service_factory = TestServiceFactory {
        ..Default::default()
    };

    // execute the task
    let result = execute_task(
        SimpleExecutor,
        task,
        artifact_manager.as_artifact_manager(),
        service_factory.as_service_factory(),
    )
    .await
    .unwrap();

    // assert the results
    assert_eq!(result.success, Success::Succeeded);
    assert_eq!(result.task_log.as_ref(), b"I ran.\n");

    let artifact = artifact_manager.get_artifact("public/info.txt").unwrap();
    assert_eq!(artifact.content_type, "text/plain");
    assert_eq!(artifact.data, Bytes::from("Hello, world."));
}
```
*/

mod artifact;
mod execute;
mod log;
mod services;

pub use artifact::TestArtifactManager;
pub use execute::{execute_task, TestExecutionResult};
pub use services::TestServiceFactory;
