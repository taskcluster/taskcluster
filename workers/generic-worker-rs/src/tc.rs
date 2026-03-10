//! Taskcluster service client abstractions.
//!
//! Provides trait-based abstractions for Taskcluster services (Queue, Auth,
//! Index, PurgeCache, WorkerManager), allowing both real and mock
//! implementations.

use anyhow::Result;
use chrono::{DateTime, Utc};
use hawk::{Credentials as HawkCredentials, Key, RequestBuilder, SHA256};
use serde::Deserialize;
use url::Url;

use crate::config::Credentials;
use crate::model::*;

/// Queue service client trait.
pub trait Queue: Send + Sync {
    /// Claim work from the queue.
    fn claim_work(
        &self,
        provisioner_id: &str,
        worker_type: &str,
        request: &ClaimWorkRequest,
    ) -> impl std::future::Future<Output = Result<ClaimWorkResponse>> + Send;

    /// Reclaim a task to extend the claim.
    fn reclaim_task(
        &self,
        task_id: &str,
        run_id: u32,
    ) -> impl std::future::Future<Output = Result<TaskReclaimResponse>> + Send;

    /// Report a task as completed.
    fn report_completed(
        &self,
        task_id: &str,
        run_id: u32,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Report a task as failed.
    fn report_failed(
        &self,
        task_id: &str,
        run_id: u32,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Report a task as exception.
    fn report_exception(
        &self,
        task_id: &str,
        run_id: u32,
        reason: &str,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Create an artifact.
    fn create_artifact(
        &self,
        task_id: &str,
        run_id: u32,
        name: &str,
        request: &serde_json::Value,
    ) -> impl std::future::Future<Output = Result<serde_json::Value>> + Send;

    /// Finish an artifact.
    fn finish_artifact(
        &self,
        task_id: &str,
        run_id: u32,
        name: &str,
        request: &serde_json::Value,
    ) -> impl std::future::Future<Output = Result<()>> + Send;

    /// Get task status.
    fn status(
        &self,
        task_id: &str,
    ) -> impl std::future::Future<Output = Result<TaskStatusStructure>> + Send;
}

/// Auth service client trait.
pub trait Auth: Send + Sync {
    /// Get websocktunnel token.
    fn websocktunnel_token(
        &self,
        wst_audience: &str,
        wst_client: &str,
    ) -> impl std::future::Future<Output = Result<WebsocktunnelTokenResponse>> + Send;
}

/// Index service client trait.
pub trait Index: Send + Sync {
    /// Find a task by namespace.
    fn find_task(
        &self,
        namespace: &str,
    ) -> impl std::future::Future<Output = Result<IndexedTaskResponse>> + Send;
}

/// PurgeCache service client trait.
pub trait PurgeCache: Send + Sync {
    /// Get purge cache requests since a given time.
    fn purge_requests(
        &self,
        provisioner_id: &str,
        worker_type: &str,
        since: Option<DateTime<Utc>>,
    ) -> impl std::future::Future<Output = Result<PurgeCacheResponse>> + Send;
}

/// WorkerManager service client trait.
pub trait WorkerManager: Send + Sync {
    /// Check if the worker should terminate.
    fn should_worker_terminate(
        &self,
        worker_pool_id: &str,
        worker_group: &str,
        worker_id: &str,
    ) -> impl std::future::Future<Output = Result<bool>> + Send;
}

// Response types for service APIs.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebsocktunnelTokenResponse {
    pub token: String,
    pub tunnel_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexedTaskResponse {
    pub task_id: String,
    pub namespace: String,
    pub rank: f64,
    pub data: serde_json::Value,
    pub expires: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeCacheResponse {
    pub requests: Vec<PurgeCacheEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeCacheEntry {
    pub provisioner_id: String,
    pub worker_type: String,
    pub cache_name: String,
    pub before: DateTime<Utc>,
}

/// Factory for creating service clients, enabling dependency injection.
pub struct ServiceFactory {
    pub root_url: String,
    pub credentials: Credentials,
}

impl ServiceFactory {
    pub fn new(root_url: String, credentials: Credentials) -> Self {
        Self {
            root_url,
            credentials,
        }
    }
}

/// Real implementation of the Queue service client.
pub struct HttpQueue {
    client: reqwest::Client,
    root_url: String,
    credentials: Credentials,
}

impl HttpQueue {
    pub fn new(root_url: String, credentials: Credentials) -> Self {
        Self {
            client: reqwest::Client::new(),
            root_url,
            credentials,
        }
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}/api/queue/v1{}", self.root_url, path)
    }

    fn hawk_header(&self, method: &str, url_str: &str) -> Result<String> {
        let url = Url::parse(url_str)?;
        let credentials = HawkCredentials {
            id: self.credentials.client_id.clone(),
            key: Key::new(self.credentials.access_token.as_bytes(), SHA256)
                .map_err(|e| anyhow::anyhow!("Failed to create Hawk key: {:?}", e))?,
        };
        let request = RequestBuilder::from_url(method, &url)
            .map_err(|e| anyhow::anyhow!("Failed to build Hawk request: {:?}", e))?
            .request();
        let header = request
            .make_header(&credentials)
            .map_err(|e| anyhow::anyhow!("Failed to make Hawk header: {:?}", e))?;
        Ok(format!("Hawk {}", header))
    }
}

impl Queue for HttpQueue {
    async fn claim_work(
        &self,
        provisioner_id: &str,
        worker_type: &str,
        request: &ClaimWorkRequest,
    ) -> Result<ClaimWorkResponse> {
        let url = self.api_url(&format!(
            "/claim-work/{}/{}",
            provisioner_id, worker_type
        ));
        let response = self
            .client
            .post(&url)
            .header("Authorization", self.hawk_header("POST", &url)?)
            .json(request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("ClaimWork failed with status {status}: {body}");
        }

        Ok(response.json().await?)
    }

    async fn reclaim_task(&self, task_id: &str, run_id: u32) -> Result<TaskReclaimResponse> {
        let url = self.api_url(&format!("/task/{}/runs/{}/reclaim", task_id, run_id));
        let response = self
            .client
            .post(&url)
            .header("Authorization", self.hawk_header("POST", &url)?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("ReclaimTask failed with status {status}: {body}");
        }

        Ok(response.json().await?)
    }

    async fn report_completed(&self, task_id: &str, run_id: u32) -> Result<()> {
        let url = self.api_url(&format!("/task/{}/runs/{}/completed", task_id, run_id));
        let response = self
            .client
            .put(&url)
            .header("Authorization", self.hawk_header("PUT", &url)?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("ReportCompleted failed with status {status}: {body}");
        }

        Ok(())
    }

    async fn report_failed(&self, task_id: &str, run_id: u32) -> Result<()> {
        let url = self.api_url(&format!("/task/{}/runs/{}/failed", task_id, run_id));
        let response = self
            .client
            .put(&url)
            .header("Authorization", self.hawk_header("PUT", &url)?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("ReportFailed failed with status {status}: {body}");
        }

        Ok(())
    }

    async fn report_exception(&self, task_id: &str, run_id: u32, reason: &str) -> Result<()> {
        let url = self.api_url(&format!("/task/{}/runs/{}/exception", task_id, run_id));
        let body = serde_json::json!({ "reason": reason });
        let response = self
            .client
            .put(&url)
            .header("Authorization", self.hawk_header("PUT", &url)?)
            .json(&body)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("ReportException failed with status {status}: {body}");
        }

        Ok(())
    }

    async fn create_artifact(
        &self,
        task_id: &str,
        run_id: u32,
        name: &str,
        request: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        let url = self.api_url(&format!(
            "/task/{}/runs/{}/artifacts/{}",
            task_id, run_id, name
        ));
        let response = self
            .client
            .post(&url)
            .header("Authorization", self.hawk_header("POST", &url)?)
            .json(request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("CreateArtifact failed with status {status}: {body}");
        }

        Ok(response.json().await?)
    }

    async fn finish_artifact(
        &self,
        task_id: &str,
        run_id: u32,
        name: &str,
        request: &serde_json::Value,
    ) -> Result<()> {
        let url = self.api_url(&format!(
            "/task/{}/runs/{}/artifacts/{}/finish",
            task_id, run_id, name
        ));
        let response = self
            .client
            .put(&url)
            .header("Authorization", self.hawk_header("PUT", &url)?)
            .json(request)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("FinishArtifact failed with status {status}: {body}");
        }

        Ok(())
    }

    async fn status(&self, task_id: &str) -> Result<TaskStatusStructure> {
        let url = self.api_url(&format!("/task/{}/status", task_id));
        let response = self
            .client
            .get(&url)
            .header("Authorization", self.hawk_header("GET", &url)?)
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            anyhow::bail!("Status failed with status {status}: {body}");
        }

        Ok(response.json().await?)
    }
}
