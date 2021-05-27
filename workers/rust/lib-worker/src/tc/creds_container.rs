use crate::tc::{QueueService, ServiceFactory};
use std::sync::{Arc, Mutex};
use taskcluster::{ClientBuilder, Credentials, Queue};

/// A CredsContainer holds information necessary to create service clients, and
/// implements [`ServiceFactory`] to provide those clients.  Owners of the
/// CredsContainer itself can update the credentials, so that subsequent service
/// clients will use the new credentials.
#[derive(Clone)]
pub(crate) struct CredsContainer(Arc<Mutex<Inner>>);

struct Inner {
    root_url: String,
    creds: Credentials,
    queue: Option<Arc<Queue>>,
}

#[allow(dead_code)]
impl CredsContainer {
    pub(crate) fn new(root_url: String, creds: Credentials) -> Self {
        Self(Arc::new(Mutex::new(Inner {
            root_url,
            creds,
            queue: None,
        })))
    }

    /// Update the credentials in this container.  Any subsequent use of the associated
    /// [`ServiceFactory`] will return updated service clients, although existing clients (such as
    /// those in mid-transaction) will continue to use the old credentials.
    pub(crate) fn set_creds(&self, creds: Credentials) {
        let mut inner = self.0.lock().unwrap();
        inner.creds = creds;
        // queue is invalidated, so reset it to None
        inner.queue = None;
    }

    /// Get the credentials in this container (currently only used for tests)
    #[cfg(test)]
    pub(crate) fn get(&self) -> Credentials {
        let inner = self.0.lock().unwrap();
        inner.creds.clone()
    }

    /// Get a [`ServiceFactory`] associated with this container
    pub(crate) fn as_service_factory(&self) -> Arc<dyn ServiceFactory> {
        // this creates Arc<Arc<..>>, which seems odd -- but the outer
        // Arc is a trait object, while the inner is a CredsCotnainer
        Arc::new(Self(self.0.clone()))
    }
}

impl ServiceFactory for CredsContainer {
    fn root_url(&self) -> String {
        return self.0.lock().unwrap().root_url.clone();
    }

    fn queue(&self) -> anyhow::Result<Arc<dyn QueueService>> {
        let mut inner = self.0.lock().unwrap();
        if let Some(ref queue) = inner.queue {
            Ok((*queue).clone())
        } else {
            let queue = Arc::new(Queue::new(
                ClientBuilder::new(&inner.root_url).credentials(inner.creds.clone()),
            )?);
            inner.queue = Some(queue.clone());
            Ok(queue)
        }
    }
}
