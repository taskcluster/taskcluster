//! Error types and exit codes for the generic worker.

use std::fmt;
use std::process::ExitCode;

/// Exit codes matching the Go implementation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum WorkerExitCode {
    TasksComplete = 0,
    CantLoadConfig = 64,
    CantInstallGenericWorker = 65,
    RebootRequired = 67,
    IdleTimeout = 68,
    InternalError = 69,
    WorkerManagerShutdown = 70,
    WorkerStopped = 71,
    WorkerShutdown = 72,
    InvalidConfig = 73,
    CantCreateEd25519Keypair = 75,
    CantCopyToTempFile = 76,
    CantConnectProtocolPipe = 78,
    CantCreateFile = 79,
    CantCreateDirectory = 80,
    CantUnarchive = 81,
    CantGetWorkerStatus = 84,
}

impl From<WorkerExitCode> for ExitCode {
    fn from(code: WorkerExitCode) -> ExitCode {
        ExitCode::from(code as u8)
    }
}

impl fmt::Display for WorkerExitCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TasksComplete => write!(f, "tasks complete"),
            Self::CantLoadConfig => write!(f, "cannot load config"),
            Self::CantInstallGenericWorker => write!(f, "cannot install generic worker"),
            Self::RebootRequired => write!(f, "reboot required"),
            Self::IdleTimeout => write!(f, "idle timeout"),
            Self::InternalError => write!(f, "internal error"),
            Self::WorkerManagerShutdown => write!(f, "worker manager shutdown"),
            Self::WorkerStopped => write!(f, "worker stopped"),
            Self::WorkerShutdown => write!(f, "worker shutdown"),
            Self::InvalidConfig => write!(f, "invalid config"),
            Self::CantCreateEd25519Keypair => write!(f, "cannot create ed25519 keypair"),
            Self::CantCopyToTempFile => write!(f, "cannot copy to temp file"),
            Self::CantConnectProtocolPipe => write!(f, "cannot connect protocol pipe"),
            Self::CantCreateFile => write!(f, "cannot create file"),
            Self::CantCreateDirectory => write!(f, "cannot create directory"),
            Self::CantUnarchive => write!(f, "cannot unarchive"),
            Self::CantGetWorkerStatus => write!(f, "cannot get worker status"),
        }
    }
}

/// Task resolution status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskStatus {
    Unclaimed,
    Claimed,
    Reclaimed,
    Aborted,
    Cancelled,
    Succeeded,
    Failed,
    Errored,
    Unknown,
    DeadlineExceeded,
}

impl fmt::Display for TaskStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unclaimed => write!(f, "Unclaimed"),
            Self::Claimed => write!(f, "Claimed"),
            Self::Reclaimed => write!(f, "Reclaimed"),
            Self::Aborted => write!(f, "Aborted"),
            Self::Cancelled => write!(f, "Cancelled"),
            Self::Succeeded => write!(f, "Succeeded"),
            Self::Failed => write!(f, "Failed"),
            Self::Errored => write!(f, "Errored"),
            Self::Unknown => write!(f, "Unknown"),
            Self::DeadlineExceeded => write!(f, "Deadline Exceeded"),
        }
    }
}

/// Reason for a task status update.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TaskUpdateReason {
    WorkerShutdown,
    MalformedPayload,
    ResourceUnavailable,
    InternalError,
    IntermittentTask,
}

impl fmt::Display for TaskUpdateReason {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::WorkerShutdown => write!(f, "worker-shutdown"),
            Self::MalformedPayload => write!(f, "malformed-payload"),
            Self::ResourceUnavailable => write!(f, "resource-unavailable"),
            Self::InternalError => write!(f, "internal-error"),
            Self::IntermittentTask => write!(f, "intermittent-task"),
        }
    }
}

/// A command execution error with task status context.
#[derive(Debug)]
pub struct CommandExecutionError {
    pub task_status: TaskStatus,
    pub cause: anyhow::Error,
    pub reason: TaskUpdateReason,
}

impl CommandExecutionError {
    pub fn new(
        task_status: TaskStatus,
        cause: impl Into<anyhow::Error>,
        reason: TaskUpdateReason,
    ) -> Self {
        Self {
            task_status,
            cause: cause.into(),
            reason,
        }
    }
}

impl fmt::Display for CommandExecutionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "status={}, reason={}, cause={}",
            self.task_status, self.reason, self.cause
        )
    }
}

impl std::error::Error for CommandExecutionError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.cause.source()
    }
}

/// Accumulator for multiple execution errors during task processing.
#[derive(Debug, Default)]
pub struct ExecutionErrors {
    errors: Vec<CommandExecutionError>,
}

impl ExecutionErrors {
    pub fn new() -> Self {
        Self { errors: Vec::new() }
    }

    pub fn add(&mut self, err: CommandExecutionError) {
        self.errors.push(err);
    }

    pub fn add_option(&mut self, err: Option<CommandExecutionError>) {
        if let Some(e) = err {
            self.errors.push(e);
        }
    }

    pub fn occurred(&self) -> bool {
        !self.errors.is_empty()
    }

    pub fn worker_shutdown(&self) -> bool {
        self.errors
            .iter()
            .any(|e| e.reason == TaskUpdateReason::WorkerShutdown)
    }

    pub fn iter(&self) -> impl Iterator<Item = &CommandExecutionError> {
        self.errors.iter()
    }
}

impl fmt::Display for ExecutionErrors {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        for (i, err) in self.errors.iter().enumerate() {
            if i > 0 {
                writeln!(f)?;
            }
            write!(f, "{err}")?;
        }
        Ok(())
    }
}

// Helper constructors matching Go conventions.

pub fn malformed_payload_error(cause: impl Into<anyhow::Error>) -> CommandExecutionError {
    CommandExecutionError::new(TaskStatus::Errored, cause, TaskUpdateReason::MalformedPayload)
}

pub fn resource_unavailable_error(cause: impl Into<anyhow::Error>) -> CommandExecutionError {
    CommandExecutionError::new(
        TaskStatus::Errored,
        cause,
        TaskUpdateReason::ResourceUnavailable,
    )
}

pub fn internal_error(cause: impl Into<anyhow::Error>) -> CommandExecutionError {
    CommandExecutionError::new(TaskStatus::Errored, cause, TaskUpdateReason::InternalError)
}

pub fn failure(cause: impl Into<anyhow::Error>) -> CommandExecutionError {
    CommandExecutionError::new(TaskStatus::Failed, cause, TaskUpdateReason::InternalError)
}
