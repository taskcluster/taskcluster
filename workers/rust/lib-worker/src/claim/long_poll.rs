use crate::claim::TaskClaim;
use crate::process::ProcessFactory;
use crate::tc::ServiceFactory;
use anyhow::Result;
use async_trait::async_trait;
use serde_json::json;
use slog::{debug, Logger};
use std::convert::TryInto;
use std::sync::Arc;
use taskcluster::err_status_code;
use tokio::sync::mpsc;

/// A process to manage the long-polling calls to queue.claimWork, minimizing the number of times
/// we interrupt the connection.  This is an implementtion utility for WorkClaimer.
pub(super) struct ClaimWorkLongPoll {
    /// Logger for this instance
    pub(super) logger: Logger,

    /// Channel over which new tasks are sent
    pub(super) tasks_tx: mpsc::Sender<TaskClaim>,

    /// Current available capacity for new tasks
    pub(super) available_capacity: usize,

    pub(super) worker_service_factory: Arc<dyn ServiceFactory>,
    pub(super) task_queue_id: String,
    pub(super) worker_group: String,
    pub(super) worker_id: String,
}

#[derive(Debug)]
pub(super) enum LongPollCommand {
    /// Increase the available capacity by one
    IncrementCapacity,
}

#[async_trait]
impl ProcessFactory for ClaimWorkLongPoll {
    type Command = LongPollCommand;
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        // ideally, we could run the `queue.claimWork` call concurrently with polling the command
        // channel, but the simpler option is to just alternate the two.  The channel has enough
        // space to hold `capacity` IncrementCapacity commands, which is the most that might exist
        // at any time.
        loop {
            // first, read as much as we can from the channel, blocking if there's no capacity
            loop {
                tokio::select! {
                    biased;
                    cmd = commands.recv() => {
                        match cmd {
                            Some(LongPollCommand::IncrementCapacity) =>
                                self.available_capacity += 1,
                            // command channel has closed -> time to exit
                            None => return Ok(()),
                        }
                    },
                    // if capacity is nonzero and there aren't messages, break out of the loop
                    _ = std::future::ready(()), if self.available_capacity != 0 => { break; }
                }
            }

            // next, perform the long poll and send the results

            let queue = self.worker_service_factory.queue()?;
            let payload = json!({
                "tasks": self.available_capacity,
                "workerGroup": &self.worker_group,
                "workerId": &self.worker_id,
            });
            debug!(
                self.logger,
                "calling queue.claimWork for {} tasks", self.available_capacity
            );
            let claims = match queue.claimWork(&self.task_queue_id, &payload).await {
                Ok(claims) => claims,
                Err(e) => {
                    // fail on client errors (4xx), causing the worker to exit
                    if let Some(status_code) = err_status_code(&e) {
                        if status_code.is_client_error() {
                            return Err(e);
                        }
                    }
                    // .. but for everything else, retry indefinitely, rather than interrupting
                    // running tasks and perhaps leaving the worker in a state from which it must
                    // be manually recovered.
                    //
                    // The client library will already have retried this call a few times, so
                    // there's no need for an additional sleep here.
                    continue;
                }
            };
            if let Some(task_claims) = claims.get("tasks").map(|tasks| tasks.as_array()).flatten() {
                debug!(
                    self.logger,
                    "claimWork returned {} tasks",
                    task_claims.len()
                );
                for v in task_claims {
                    let task_claim: TaskClaim = v.clone().try_into()?;
                    self.available_capacity -= 1;
                    self.tasks_tx.send(task_claim.into()).await?;
                }
            }
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::tc::QueueService;
    use crate::test::{test_logger, test_task_json};
    use crate::testing::TestServiceFactory;
    use serde_json::{json, Value};
    use std::sync::Mutex;
    use tokio::time::{sleep, Duration};

    /// Fake Queue that returns the given claims on each call.  The Mutex allows
    /// us to modify (to pop items from the vector) in a thread-safe fashion.
    struct FakeQueue(Mutex<Vec<Vec<Value>>>);

    #[async_trait]
    impl QueueService for FakeQueue {
        async fn claimWork(
            &self,
            task_queue_id: &str,
            payload: &Value,
        ) -> std::result::Result<Value, anyhow::Error> {
            assert_eq!(task_queue_id, "aa/bb");
            assert_eq!(payload["workerGroup"], json!("wg"));
            assert_eq!(payload["workerId"], json!("wi"));

            let num_requested = payload["tasks"].as_i64().unwrap() as usize;

            let mut return_values = self.0.lock().unwrap();
            let task_claim_values = if return_values.len() > 0 {
                let claims = return_values.remove(0);
                assert!(num_requested >= claims.len());
                Value::Array(claims)
            } else {
                Value::Array(vec![])
            };

            Ok(json!({ "tasks": task_claim_values }))
        }
    }

    fn make_claim(task_id: &'static str) -> Value {
        json!({
            "status": {
                "taskId": task_id,
            },
            "task": test_task_json(),
            "credentials": {
                "clientId": "cli",
                "accessToken": "at",
            },
            "takenUntil": "2021-05-28T15:31:06Z",
            "runId": 0
        })
    }

    #[tokio::test]
    async fn test_poll_counts() {
        // and we read the resulting TaskClaims here
        let (tasks_tx, mut tasks_rx) = mpsc::channel(5);

        let claims = vec![
            vec![make_claim("task1"), make_claim("task2")],
            vec![make_claim("task3")],
            vec![make_claim("task4")],
            vec![make_claim("task5")],
        ];

        let worker_service_factory = Arc::new(TestServiceFactory {
            queue: Some(Arc::new(FakeQueue(Mutex::new(claims)))),
            ..Default::default()
        });

        let lp = ClaimWorkLongPoll {
            logger: test_logger(),
            tasks_tx,
            available_capacity: 3,
            worker_service_factory,
            task_queue_id: "aa/bb".to_owned(),
            worker_group: "wg".to_owned(),
            worker_id: "wi".to_owned(),
        };
        let mut lp = lp.start();

        // with capacity 3, we should get three tasks before timing out
        let mut got_tasks = vec![];
        loop {
            tokio::select! {
                Err(e) = (&mut lp) => { panic!("long poller exited early: {:?}", e); },
                Some(tc) = tasks_rx.recv() => { got_tasks.push(tc.task_id); },
                _ = sleep(Duration::from_millis(100)) => { break },
            };
        }
        assert_eq!(
            got_tasks,
            vec!["task1".to_owned(), "task2".to_owned(), "task3".to_owned()]
        );

        // indicate capacity is available, and get the next task; but note we never get task5
        lp.command(LongPollCommand::IncrementCapacity)
            .await
            .unwrap();

        let mut got_tasks = vec![];
        loop {
            tokio::select! {
                Err(e) = (&mut lp) => { panic!("long poller exited early: {:?}", e); },
                Some(tc) = tasks_rx.recv() => { got_tasks.push(tc.task_id); },
                _ = sleep(Duration::from_millis(100)) => { break },
            };
        }
        assert_eq!(got_tasks, vec!["task4".to_owned()]);

        // shut down the poller
        lp.stop().await.unwrap();
        lp.await.unwrap();
    }
}
