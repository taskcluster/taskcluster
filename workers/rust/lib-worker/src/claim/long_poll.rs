use crate::claim::TaskClaim;
use crate::process::ProcessFactory;
use crate::tc::ServiceFactory;
use anyhow::Result;
use async_trait::async_trait;
use serde_json::json;
use slog::{debug, Logger};
use std::convert::TryInto;
use std::sync::Arc;
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
            let claims = queue.claimWork(&self.task_queue_id, &payload).await?;
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
