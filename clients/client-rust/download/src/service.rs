//! Trait wrappers around Taskcluster types to allow fake injection during tests.
use anyhow::Error;
use async_trait::async_trait;
use serde_json::Value;
use taskcluster::{Object, Queue};

/// A private wrapper around the necessary methods of the object service.
#[allow(non_snake_case)]
#[async_trait]
pub(super) trait ObjectService {
    async fn startDownload(&self, name: &str, payload: &Value)
        -> std::result::Result<Value, Error>;
}

/// Trivial implementation of the ObjectService trait for the Object client struct
#[async_trait]
impl ObjectService for Object {
    async fn startDownload(
        &self,
        name: &str,
        payload: &Value,
    ) -> std::result::Result<Value, Error> {
        (self as &Object).startDownload(name, payload).await
    }
}

/// A private wrapper around the necessary methods of the object service.
#[allow(non_snake_case)]
#[async_trait]
pub(super) trait QueueService {
    async fn artifact(
        &self,
        task_id: &str,
        run_id: &str,
        name: &str,
    ) -> std::result::Result<Value, Error>;
    async fn latestArtifact(&self, task_id: &str, name: &str) -> std::result::Result<Value, Error>;
}

/// Trivial implementation of the QueueService trait for the Queue client struct
#[async_trait]
impl QueueService for Queue {
    async fn artifact(
        &self,
        task_id: &str,
        run_id: &str,
        name: &str,
    ) -> std::result::Result<Value, Error> {
        (self as &Queue).artifact(task_id, run_id, name).await
    }

    async fn latestArtifact(&self, task_id: &str, name: &str) -> std::result::Result<Value, Error> {
        (self as &Queue).latestArtifact(task_id, name).await
    }
}
