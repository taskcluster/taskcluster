/*!

Support for claiming jobs.  This forms the core of any worker implementation, which must only
supply an executor to execute the claimed tasks.

# Example

What follows is a rather lengthy example of a do-nothing worker that claims and immediately
resolves tasks with either success or failure, depending on the payload.

```
use serde::Deserialize;
use slog::{o, Drain, Logger};
use taskcluster::Credentials;
use taskcluster_lib_worker::claim::WorkClaimer;
use taskcluster_lib_worker::executor::{self, ExecutionContext, Executor, Success};
use async_trait::async_trait;

#[derive(Deserialize)]
struct Payload {
    success: bool,
}

impl executor::Payload for Payload {
    fn from_value(v: serde_json::Value) -> Result<Self, anyhow::Error> {
        Ok(serde_json::from_value(v)?)
    }
}

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
    let wc = WorkClaimer::new(executor)
        .logger(logger)
        .root_url(root_url)
        .worker_creds(Credentials::from_env().unwrap())
        .task_queue_id(task_queue_id)
        .worker_group(worker_group)
        .worker_id(worker_id)
        .capacity(4)
        .build();
    let wc = wc.start();
    wc.await
}
# // this example doesn't actually run, since it requires actual credentials
# fn main() {}
```
*/

mod long_poll;
mod task_claim;
mod work_claimer;

pub(crate) use task_claim::TaskClaim;
pub use work_claimer::{WorkClaimer, WorkClaimerBuilder};
