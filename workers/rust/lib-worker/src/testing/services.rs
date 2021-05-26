use crate::tc::{QueueService, ServiceFactory};
use std::sync::Arc;

/// An implementation of ServiceFactory that just returns the same value every time, and
/// returns a fake root URL.  This is used for testing, and is only avaliable in debug builds.
#[derive(Default)]
pub struct TestServiceFactory {
    pub queue: Option<Arc<dyn QueueService>>,
}

impl TestServiceFactory {
    /// Convert to an Arc<dyn ServiceFactory>
    pub fn as_service_factory(self) -> Arc<dyn ServiceFactory> {
        Arc::new(self)
    }
}

impl ServiceFactory for TestServiceFactory {
    fn root_url(&self) -> String {
        "https://tc-tests.example.com".to_owned()
    }

    /// Get an implementation of the Queue service
    fn queue(&self) -> anyhow::Result<Arc<dyn QueueService>> {
        if let Some(ref queue) = self.queue {
            Ok(queue.clone())
        } else {
            anyhow::bail!("No test queue instance defined")
        }
    }
}
