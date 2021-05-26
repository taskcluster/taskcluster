use crate::artifact::ArtifactManager;
use async_trait::async_trait;
use bytes::Bytes;
use chrono::prelude::*;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use taskcluster_upload::AsyncReaderFactory;
use tokio::io::AsyncReadExt;

#[derive(Debug, Clone, PartialEq)]
pub struct Artifact {
    pub data: Bytes,
    pub content_type: String,
    pub expires: DateTime<Utc>,
}

pub struct TestArtifactManager(Arc<Inner>);

impl TestArtifactManager {
    pub fn new() -> Self {
        Self(Arc::new(Inner {
            artifacts: Mutex::new(HashMap::new()),
        }))
    }

    /// Create an [`ArtifactManager`] implementation suitable for use in testing.
    pub fn as_artifact_manager(&self) -> Arc<dyn ArtifactManager> {
        Arc::new(self.0.clone())
    }

    /// Get the named artifact, if it exists
    pub fn get_artifact(&self, name: &str) -> Option<Artifact> {
        self.0.artifacts.lock().unwrap().get(name).cloned()
    }
}

struct Inner {
    artifacts: Mutex<HashMap<String, Artifact>>,
}

#[async_trait]
impl ArtifactManager for Arc<Inner> {
    async fn create_artifact_with_factory(
        &self,
        name: &str,
        content_type: &str,
        content_length: u64,
        expires: DateTime<Utc>,
        mut factory: Box<dyn AsyncReaderFactory + 'static + Sync + Send>,
    ) -> anyhow::Result<()> {
        // first, get the artifact data
        let mut reader = factory.get_reader().await?;
        let mut data = vec![];
        reader.read_to_end(&mut data).await?;

        assert_eq!(data.len(), content_length as usize);

        // now, add it to the artifacts hashmap
        let mut guard = self.artifacts.lock().unwrap();
        guard.insert(
            name.to_owned(),
            Artifact {
                data: data.into(),
                content_type: content_type.to_owned(),
                expires,
            },
        );

        Ok(())
    }
}
