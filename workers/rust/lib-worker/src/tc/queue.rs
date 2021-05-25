use anyhow::Error;
use async_trait::async_trait;
use serde_json::Value;
use std::sync::Arc;
use taskcluster::Queue;

/// A QueueFactory can efficiently supply Queue instances on-demand.  Call this each time
/// you need a queue, rather than caching the value for any length of time, to allow new
/// instances to be created.  This trait is also a useful point for depnedency injection
/// in tests.
pub trait QueueFactory: 'static + Sync + Send {
    fn queue(&self) -> anyhow::Result<Arc<dyn QueueService>>;
}

/// A trait including all of the Queue methods that workers need; in production this will call
/// the queue service, but in testing it can be faked.
#[allow(non_snake_case)]
#[async_trait]
pub trait QueueService: 'static + Sync + Send {
    async fn claimWork(
        &self,
        taskQueueId: &str,
        payload: &Value,
    ) -> std::result::Result<Value, Error>;
    async fn createArtifact(
        &self,
        taskId: &str,
        runId: &str,
        name: &str,
        payload: &Value,
    ) -> Result<Value, Error>;
    async fn finishArtifact(
        &self,
        taskId: &str,
        runId: &str,
        name: &str,
        payload: &Value,
    ) -> Result<(), Error>;
    async fn reportCompleted(&self, taskId: &str, runId: &str) -> Result<Value, Error>;
    async fn reportFailed(&self, taskId: &str, runId: &str) -> Result<Value, Error>;
    async fn reportException(
        &self,
        taskId: &str,
        runId: &str,
        payload: &Value,
    ) -> Result<Value, Error>;
}

/// Trivial implementation of the [`QueueService`] trait for the [`Queue`] client struct
#[allow(non_snake_case)]
#[async_trait]
impl QueueService for Queue {
    async fn claimWork(
        &self,
        taskQueueId: &str,
        payload: &Value,
    ) -> std::result::Result<Value, Error> {
        (self as &Queue).claimWork(taskQueueId, payload).await
    }
    async fn createArtifact(
        &self,
        taskId: &str,
        runId: &str,
        name: &str,
        payload: &Value,
    ) -> Result<Value, Error> {
        (self as &Queue)
            .createArtifact(taskId, runId, name, payload)
            .await
    }
    async fn finishArtifact(
        &self,
        taskId: &str,
        runId: &str,
        name: &str,
        payload: &Value,
    ) -> Result<(), Error> {
        (self as &Queue)
            .finishArtifact(taskId, runId, name, payload)
            .await
    }
    async fn reportCompleted(&self, taskId: &str, runId: &str) -> Result<Value, Error> {
        (self as &Queue).reportCompleted(taskId, runId).await
    }
    async fn reportFailed(&self, taskId: &str, runId: &str) -> Result<Value, Error> {
        (self as &Queue).reportFailed(taskId, runId).await
    }
    async fn reportException(
        &self,
        taskId: &str,
        runId: &str,
        payload: &Value,
    ) -> Result<Value, Error> {
        (self as &Queue)
            .reportException(taskId, runId, payload)
            .await
    }
}
