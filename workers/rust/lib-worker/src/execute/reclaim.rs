use crate::process::ProcessFactory;
use crate::tc::{CredsContainer, ServiceFactory};
use anyhow::Result;
use async_trait::async_trait;
use chrono::prelude::*;
use serde::Deserialize;
use slog::{debug, Logger};
use std::sync::Arc;
use taskcluster::{err_status_code, Credentials, StatusCode};
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};

/// A process to manage reclaiming a task.  This takes ownership of a CredsContainer
pub(super) struct TaskReclaimer {
    /// Logger for this instance
    logger: Logger,

    /// [`CredsContainer`] to update on renewal
    creds_container: CredsContainer,

    /// The service factory to use for renewal
    service_factory: Arc<dyn ServiceFactory>,

    /// Time before which the (initial) reclaim must be done
    taken_until: DateTime<Utc>,

    task_id: String,
    run_id: u32,
}

impl TaskReclaimer {
    pub(super) fn new(
        logger: Logger,
        creds_container: CredsContainer,
        taken_until: DateTime<Utc>,
        task_id: String,
        run_id: u32,
    ) -> Self {
        let service_factory = creds_container.as_service_factory();
        Self {
            logger,
            creds_container,
            service_factory,
            taken_until,
            task_id,
            run_id,
        }
    }
}

/// Calculate the time to wake and start calling `queue.reclaimTask` given a `taken_until` value.
/// This currently chooses a time 3 minutes before the credentials expire, in order to allow time
/// for pending API calls to retry, but at least 30s from now to avoid hammering the queue.
fn reclaim_time_for_taken_until(now: DateTime<Utc>, taken_until: DateTime<Utc>) -> DateTime<Utc> {
    let mut reclaim_time = taken_until - chrono::Duration::minutes(3);

    // use a shorter min_reclaim_duration in testing
    #[cfg(debug_assertions)]
    let min_reclaim_duration = chrono::Duration::milliseconds(100);
    #[cfg(not(debug_assertions))]
    let min_reclaim_duration = chrono::Duration::seconds(30);

    if reclaim_time - now < min_reclaim_duration {
        reclaim_time = now + min_reclaim_duration;
    }

    reclaim_time
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reclaim {
    credentials: Credentials,
    taken_until: DateTime<Utc>,
}

#[async_trait]
impl ProcessFactory for TaskReclaimer {
    type Command = ();
    async fn run(mut self, mut commands: mpsc::Receiver<Self::Command>) -> Result<()> {
        let mut reclaim_time = reclaim_time_for_taken_until(Utc::now(), self.taken_until);

        loop {
            let sleep_ms = (reclaim_time - Utc::now()).num_milliseconds();
            debug!(self.logger, "sleeping {} ms", sleep_ms);
            tokio::select! {
                None = commands.recv() => { break },
                _ = sleep(Duration::from_millis(sleep_ms as u64)) => { },
            }

            debug!(self.logger, "reclaiming task");

            let run_id_str = format!("{}", self.run_id);
            let reclaim = match self
                .service_factory
                .queue()?
                .reclaimTask(&self.task_id, &run_id_str)
                .await
            {
                Ok(reclaim) => reclaim,
                Err(e) => {
                    // the reclaim failed, so we will fail this process, but before doing so we add
                    // context to CONFLICT, to help debugging
                    return if let Some(StatusCode::CONFLICT) = err_status_code(&e) {
                        Err(e.context("Task is no longer running"))
                    } else {
                        Err(e)
                    };
                }
            };

            let reclaim: Reclaim = serde_json::from_value(reclaim)?;
            self.creds_container.set_creds(reclaim.credentials);
            reclaim_time = reclaim_time_for_taken_until(Utc::now(), reclaim.taken_until);
        }
        Ok(())
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::tc::QueueService;
    use crate::testing::test_logger;
    use crate::testing::TestServiceFactory;
    use async_trait::async_trait;
    use serde_json::{json, Value};
    use std::sync::atomic::{AtomicU32, Ordering};
    use tokio::sync::mpsc;

    fn time(ms: i64) -> DateTime<Utc> {
        Utc.ymd(2021, 5, 28).and_hms(0, 0, 0) + chrono::Duration::milliseconds(ms)
    }

    #[test]
    fn test_reclaim_time_for_taken_until_3m_early() {
        assert_eq!(
            reclaim_time_for_taken_until(time(0), time(15 * 60 * 1000)),
            time(12 * 60 * 1000)
        );
    }

    #[test]
    fn test_reclaim_time_for_taken_until_not_less_than_1s() {
        // (note that in non-test builds, it's 30s, not 100ms)
        assert_eq!(
            reclaim_time_for_taken_until(time(0), time(3 * 60 * 1000)),
            time(100)
        );
    }

    #[test]
    fn test_reclaim_time_for_taken_until_in_the_past() {
        assert_eq!(
            reclaim_time_for_taken_until(time(0), time(-10000)),
            time(100)
        );
    }

    /// Fake Queue that allows reclaiming tasks, and sends a message each time.
    struct FakeQueue(mpsc::Sender<()>, AtomicU32);

    #[async_trait]
    impl QueueService for FakeQueue {
        async fn reclaimTask(&self, task_id: &str, run_id: &str) -> Result<Value, anyhow::Error> {
            assert_eq!(task_id, "task");
            assert_eq!(run_id, "1");
            self.0.send(()).await?;
            Ok(json!({
                "credentials": {
                    "clientId": format!("cli-{}", self.1.fetch_add(1, Ordering::SeqCst)),
                    "accessToken": "at",
                },
                "takenUntil": Utc::now() + chrono::Duration::milliseconds(90),
            }))
        }
    }

    #[tokio::test]
    async fn test_renewal_process() {
        let (tx, mut rx) = mpsc::channel(10);

        let service_factory = TestServiceFactory {
            queue: Some(Arc::new(FakeQueue(tx, AtomicU32::new(1)))),
            ..Default::default()
        }
        .as_service_factory();

        let creds_container = CredsContainer::new(
            "https://tc-tests.example.com".into(),
            Credentials::new("initial", "at"),
        );

        let mut task_reclaimer = TaskReclaimer {
            logger: test_logger(),
            creds_container: creds_container.clone(),
            service_factory,
            taken_until: Utc::now() + chrono::Duration::seconds(1),
            task_id: "task".into(),
            run_id: 1,
        }
        .start();

        // wait for three reclaims
        for _ in 0u8..3 {
            rx.recv().await;
        }

        // stop the reclaimer
        task_reclaimer.stop().await.unwrap();
        task_reclaimer.await.unwrap();

        // we should now have "cli-3" in the creds container
        let creds = creds_container.get();
        assert_eq!(creds.client_id, "cli-3");
    }
}
