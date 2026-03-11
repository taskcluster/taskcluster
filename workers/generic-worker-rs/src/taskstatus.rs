//! Task status management and reclaim loop.
//!
//! Manages the lifecycle of a task's status, including periodic reclaims
//! to extend the task's lease, and status change notifications.

use anyhow::Result;
use chrono::{DateTime, Utc};
use std::sync::Arc;
use tokio::sync::{watch, Mutex, RwLock};
use tokio::time::{self, Duration};

use crate::errors::{CommandExecutionError, TaskStatus, TaskUpdateReason};
use crate::tc::{HttpQueue, Queue};

/// Callback type for task status change listeners.
pub type StatusChangeCallback = Box<dyn Fn(TaskStatus) + Send + Sync>;

/// A registered status change listener.
pub struct TaskStatusChangeListener {
    pub name: String,
    pub callback: StatusChangeCallback,
}

/// Manages task status, reclaim loop, and status change notifications.
pub struct TaskStatusManager {
    task_id: String,
    run_id: u32,
    status: Arc<RwLock<TaskStatus>>,
    taken_until: Arc<RwLock<DateTime<Utc>>>,
    abort_exception: Arc<Mutex<Option<CommandExecutionError>>>,
    listeners: Arc<Mutex<Vec<Arc<TaskStatusChangeListener>>>>,
    stop_reclaiming_tx: Option<watch::Sender<bool>>,
    reclaim_handle: Option<tokio::task::JoinHandle<()>>,
}

impl TaskStatusManager {
    /// Create a new TaskStatusManager and start the reclaim loop.
    pub fn new(
        task_id: String,
        run_id: u32,
        initial_taken_until: DateTime<Utc>,
        queue: Arc<HttpQueue>,
    ) -> Self {
        let status = Arc::new(RwLock::new(TaskStatus::Claimed));
        let taken_until = Arc::new(RwLock::new(initial_taken_until));
        let abort_exception = Arc::new(Mutex::new(None));
        let listeners = Arc::new(Mutex::new(Vec::new()));
        let (stop_tx, stop_rx) = watch::channel(false);

        // Start reclaim loop
        let reclaim_handle = {
            let task_id = task_id.clone();
            let status = status.clone();
            let taken_until = taken_until.clone();
            let listeners = listeners.clone();

            tokio::spawn(async move {
                Self::reclaim_loop(
                    task_id, run_id, queue, status, taken_until, listeners, stop_rx,
                )
                .await;
            })
        };

        Self {
            task_id,
            run_id,
            status,
            taken_until,
            abort_exception,
            listeners,
            stop_reclaiming_tx: Some(stop_tx),
            reclaim_handle: Some(reclaim_handle),
        }
    }

    async fn reclaim_loop(
        task_id: String,
        run_id: u32,
        queue: Arc<HttpQueue>,
        status: Arc<RwLock<TaskStatus>>,
        taken_until: Arc<RwLock<DateTime<Utc>>>,
        listeners: Arc<Mutex<Vec<Arc<TaskStatusChangeListener>>>>,
        mut stop_rx: watch::Receiver<bool>,
    ) {
        loop {
            // Calculate next reclaim time (reclaim when 2/3 of time has passed)
            let until = { *taken_until.read().await };
            let now = Utc::now();
            let remaining = until.signed_duration_since(now);
            let sleep_duration = remaining.num_milliseconds().max(0) as u64 * 2 / 3;
            let sleep_duration = Duration::from_millis(sleep_duration.max(1000));

            tokio::select! {
                _ = time::sleep(sleep_duration) => {}
                _ = stop_rx.changed() => {
                    if *stop_rx.borrow() {
                        return;
                    }
                }
            }

            // Check if we should stop
            if *stop_rx.borrow() {
                return;
            }

            // Attempt reclaim
            match queue.reclaim_task(&task_id, run_id).await {
                Ok(response) => {
                    *taken_until.write().await = response.taken_until;
                    *status.write().await = TaskStatus::Reclaimed;

                    // Notify listeners
                    let listeners = listeners.lock().await;
                    for listener in listeners.iter() {
                        (listener.callback)(TaskStatus::Reclaimed);
                    }
                    tracing::info!(
                        "Successfully reclaimed task {}/{}, taken until {}",
                        task_id,
                        run_id,
                        response.taken_until
                    );
                }
                Err(e) => {
                    tracing::warn!("Failed to reclaim task {}/{}: {}", task_id, run_id, e);
                }
            }
        }
    }

    /// Get the current task status.
    pub async fn last_known_status(&self) -> TaskStatus {
        *self.status.read().await
    }

    /// Get the current taken_until time.
    pub async fn taken_until(&self) -> DateTime<Utc> {
        *self.taken_until.read().await
    }

    /// Get the abort exception, if any.
    pub async fn abort_exception(&self) -> Option<CommandExecutionError> {
        self.abort_exception.lock().await.take()
    }

    /// Register a status change listener.
    pub async fn register_listener(&self, listener: Arc<TaskStatusChangeListener>) {
        self.listeners.lock().await.push(listener);
    }

    /// Deregister a status change listener by name.
    pub async fn deregister_listener(&self, name: &str) {
        let mut listeners = self.listeners.lock().await;
        listeners.retain(|l| l.name != name);
    }

    /// Abort the task with the given error.
    pub async fn abort(&self, err: CommandExecutionError) -> Result<()> {
        let current_status = *self.status.read().await;
        match current_status {
            TaskStatus::Claimed | TaskStatus::Reclaimed => {
                *self.status.write().await = TaskStatus::Aborted;
                *self.abort_exception.lock().await = Some(CommandExecutionError::new(
                    err.task_status,
                    anyhow::anyhow!("{}", err.cause),
                    err.reason,
                ));

                let listeners = self.listeners.lock().await;
                for listener in listeners.iter() {
                    (listener.callback)(TaskStatus::Aborted);
                }
                Ok(())
            }
            _ => {
                tracing::warn!("Cannot abort task in status {}, ignoring", current_status);
                Ok(())
            }
        }
    }

    /// Cancel the task.
    pub async fn cancel(&self) -> Result<()> {
        *self.status.write().await = TaskStatus::Cancelled;
        let listeners = self.listeners.lock().await;
        for listener in listeners.iter() {
            (listener.callback)(TaskStatus::Cancelled);
        }
        Ok(())
    }

    /// Stop the reclaim loop.
    pub fn stop_reclaims(&mut self) {
        if let Some(tx) = self.stop_reclaiming_tx.take() {
            let _ = tx.send(true);
        }
    }

    /// Report the task as completed.
    pub async fn report_completed(&self, queue: &HttpQueue) -> Result<()> {
        self.stop_reclaim_if_needed();
        queue.report_completed(&self.task_id, self.run_id).await?;
        *self.status.write().await = TaskStatus::Succeeded;
        Ok(())
    }

    /// Report the task as failed.
    pub async fn report_failed(&self, queue: &HttpQueue) -> Result<()> {
        self.stop_reclaim_if_needed();
        queue.report_failed(&self.task_id, self.run_id).await?;
        *self.status.write().await = TaskStatus::Failed;
        Ok(())
    }

    /// Report the task as exception.
    pub async fn report_exception(
        &self,
        queue: &HttpQueue,
        reason: TaskUpdateReason,
    ) -> Result<()> {
        self.stop_reclaim_if_needed();
        queue
            .report_exception(&self.task_id, self.run_id, &reason.to_string())
            .await?;
        *self.status.write().await = TaskStatus::Errored;
        Ok(())
    }

    fn stop_reclaim_if_needed(&self) {
        if let Some(ref tx) = self.stop_reclaiming_tx {
            let _ = tx.send(true);
        }
    }
}

impl Drop for TaskStatusManager {
    fn drop(&mut self) {
        self.stop_reclaims();
        if let Some(handle) = self.reclaim_handle.take() {
            handle.abort();
        }
    }
}
