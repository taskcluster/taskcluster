/*!
This library implements a collection of utilities for writing a Taskcluster worker in Rust,
supplementing the Rust client.

* [`artifact`] implements interfacing with artifacts
* [`claim`] implements work claiming
* [`execute`] abstracts task execution
* [`log`] provides support for the task log
* [`process`] provides an abstraction for concurrent proceses
* [`task`] provides a deserializable task struct, with some useful utilities
* [`tc`] provides support for calling Taskcluster APIs
* [`testing`] provides support for testing workers (only available in debug builds)
* [`workerproto`] supports communication with worker-runner

The [`Worker`] struct ties all of this together.

A typical worker will start a [`Worker`], passing it a custom
[`execute::Executor`] implementation.

# Example

What follows is a rather lengthy example of a do-nothing worker that claims and immediately
resolves tasks with either success or failure, depending on the payload.

```
use serde::Deserialize;
use slog::{o, Drain, Logger};
use taskcluster::Credentials;
use taskcluster_lib_worker::Worker;
use taskcluster_lib_worker::execute::{self, ExecutionContext, Executor, Success};
use async_trait::async_trait;

#[derive(Deserialize)]
struct Payload {
    success: bool,
}

// Zero-length struct in this example, but this could contain data as long as it was
// Clone-able.
struct SimpleExecutor;

#[async_trait]
impl Executor<Payload> for SimpleExecutor {
    async fn execute(&self, ctx: ExecutionContext<Payload>) -> Result<Success, anyhow::Error> {
        Ok(if ctx.payload.success { Success::Succeeded } else { Success::Failed })
    }
}

async fn worker() -> anyhow::Result<()> {
    let decorator = slog_term::TermDecorator::new().build();
    let drain = slog_term::FullFormat::new(decorator).build().fuse();
    let drain = slog_async::Async::new(drain).build().fuse();
    let logger = Logger::root(drain, o!());

    // this information would typically come from a configuraiton file
    let root_url = std::env::var("TASKCLUSTER_ROOT_URL").unwrap();
    let worker_group = std::env::var("WORKER_GROUP").unwrap();
    let worker_id = std::env::var("WORKER_ID").unwrap();
    let task_queue_id = std::env::var("TASK_QUEUE_ID").unwrap();

    let executor = SimpleExecutor;
    let w = Worker::new(executor)
        .logger(logger)
        .root_url(root_url)
        .worker_creds(Credentials::from_env().unwrap())
        .task_queue_id(task_queue_id)
        .worker_group(worker_group)
        .worker_id(worker_id)
        .capacity(4)
        .start();
    w.await
}
# // this example doesn't actually run, since it requires real credentials
# fn main() {}
```
*/

pub mod artifact;
pub mod claim;
pub mod execute;
pub mod log;
pub mod process;
pub mod task;
pub mod tc;
pub mod workerproto;

mod worker;

pub use worker::Worker;

#[cfg(debug_assertions)]
pub mod testing;
