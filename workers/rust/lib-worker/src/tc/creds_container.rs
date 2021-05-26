use crate::tc::{QueueService, ServiceFactory};
use std::sync::{Arc, Mutex};
use taskcluster::{ClientBuilder, Credentials, Queue};

/// Clonable credentials container, allowing updates as they expire.  This is used as a
/// ServiceFactory in practice, for both task credentials and worker credentials.
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

    pub(crate) fn get(&self) -> Credentials {
        return self.0.lock().unwrap().creds.clone();
    }

    pub(crate) fn set(&self, creds: Credentials) {
        let mut inner = self.0.lock().unwrap();
        inner.creds = creds;
        // queue is invalidated, so reset it to None
        inner.queue = None;
    }
}

impl ServiceFactory for CredsContainer {
    fn root_url(&self) -> String {
        let inner = self.0.lock().unwrap();
        inner.root_url.clone()
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
