//! Graceful termination handling.
//!
//! Provides a mechanism for the worker to handle shutdown signals
//! and optionally allow in-flight tasks to complete.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tokio::sync::watch;

/// Global termination state.
static TERMINATION_REQUESTED: AtomicBool = AtomicBool::new(false);

/// The callback to invoke on termination request.
static TERMINATION_CALLBACK: Mutex<Option<Box<dyn Fn(bool) + Send + Sync>>> = Mutex::new(None);

/// Global abort sender: when signalled, the currently running command is killed.
static ABORT_SENDER: Mutex<Option<watch::Sender<bool>>> = Mutex::new(None);

/// Returns true if graceful termination has been requested.
pub fn termination_requested() -> bool {
    TERMINATION_REQUESTED.load(Ordering::SeqCst)
}

/// Register a callback to be called when termination is requested.
/// The boolean parameter indicates whether the worker should finish
/// current tasks before shutting down.
///
/// Returns a function that deregisters the callback.
pub fn on_termination_request<F>(callback: F) -> impl FnOnce()
where
    F: Fn(bool) + Send + Sync + 'static,
{
    {
        let mut cb = TERMINATION_CALLBACK.lock().expect("callback lock poisoned");
        *cb = Some(Box::new(callback));
    }

    || {
        let mut cb = TERMINATION_CALLBACK.lock().expect("callback lock poisoned");
        *cb = None;
    }
}

/// Register a watch sender that will be signalled when the current task
/// should be aborted. Call this before each task's command execution phase.
/// Returns a watch::Receiver that the command executor can use.
pub fn register_abort_sender() -> (watch::Sender<bool>, watch::Receiver<bool>) {
    let (tx, rx) = watch::channel(false);
    {
        let mut guard = ABORT_SENDER.lock().expect("abort sender lock poisoned");
        *guard = Some(tx.clone());
    }
    (tx, rx)
}

/// Deregister the abort sender (call after task execution completes).
pub fn deregister_abort_sender() {
    let mut guard = ABORT_SENDER.lock().expect("abort sender lock poisoned");
    *guard = None;
}

/// Signal the abort sender to abort the currently running command.
pub fn signal_abort() {
    let guard = ABORT_SENDER.lock().expect("abort sender lock poisoned");
    if let Some(ref tx) = *guard {
        let _ = tx.send(true);
    }
}

/// Signal graceful termination.
///
/// If `finish_tasks` is true, the worker should complete any in-progress
/// tasks before shutting down. If false, tasks should be aborted.
pub fn terminate(finish_tasks: bool) {
    TERMINATION_REQUESTED.store(true, Ordering::SeqCst);

    // Always signal abort for the current task, so the task exits promptly.
    // The task will be reported as exception/worker-shutdown.
    signal_abort();

    let cb = TERMINATION_CALLBACK.lock().expect("callback lock poisoned");
    if let Some(ref callback) = *cb {
        callback(finish_tasks);
    }
}

/// Reset the termination state. Used in tests.
pub fn reset() {
    TERMINATION_REQUESTED.store(false, Ordering::SeqCst);
    let mut cb = TERMINATION_CALLBACK.lock().expect("callback lock poisoned");
    *cb = None;
    let mut sender = ABORT_SENDER.lock().expect("abort sender lock poisoned");
    *sender = None;
}

/// Install signal handlers for graceful termination.
pub fn install_signal_handlers() {
    #[cfg(unix)]
    {
        tokio::spawn(async {
            use tokio::signal::unix::{signal, SignalKind};

            let mut sigterm = signal(SignalKind::terminate()).expect("failed to install SIGTERM handler");
            let mut sigint = signal(SignalKind::interrupt()).expect("failed to install SIGINT handler");

            tokio::select! {
                _ = sigterm.recv() => {
                    tracing::info!("Received SIGTERM, requesting graceful termination");
                    terminate(true);
                }
                _ = sigint.recv() => {
                    tracing::info!("Received SIGINT, requesting immediate termination");
                    terminate(false);
                }
            }
        });
    }

    #[cfg(windows)]
    {
        tokio::spawn(async {
            tokio::signal::ctrl_c()
                .await
                .expect("failed to install Ctrl+C handler");
            tracing::info!("Received Ctrl+C, requesting graceful termination");
            terminate(true);
        });
    }
}
