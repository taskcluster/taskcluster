//! Utilities for testing downloads
use crate::service::{ObjectService, QueueService};
use anyhow::Error;
use async_trait::async_trait;
use httptest::{matchers::*, responders::*, Expectation};
use serde_json::Value;
use std::fmt;
use std::sync::{Arc, Mutex};

const PLAINTEXT_BODY: &[u8] = b"hello, world";

const GZIPPED_BODY: &[u8] = &[
    31u8, 139, 8, 0, 0, 0, 0, 0, 0, 255, 203, 72, 205, 201, 201, 215, 81, 40, 207, 47, 202, 73, 1,
    0, 58, 114, 171, 255, 12, 0, 0, 0,
];

/// An httptest matcher that logs the matched value with `dbg!()` and always matches.
pub(crate) struct Dbg;
impl<IN> Matcher<IN> for Dbg
where
    IN: fmt::Debug + ?Sized,
{
    fn matches(&mut self, input: &IN, _ctx: &mut ExecutionContext) -> bool {
        dbg!(input);
        true
    }

    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Dbg()")
    }
}

/// Event logger, used to log events from various places and then assert on them.
#[derive(Default, Clone)]
pub(crate) struct Logger {
    logged: Arc<Mutex<Vec<String>>>,
}

impl Logger {
    pub(crate) fn log<S: Into<String>>(&self, message: S) {
        self.logged.lock().unwrap().push(message.into())
    }

    pub(crate) fn assert(&self, expected: Vec<String>) {
        assert_eq!(*self.logged.lock().unwrap(), expected);
    }
}

/// Fake implementation of the Object service, that supports the simple method
pub(crate) struct FakeObjectService {
    pub(crate) logger: Logger,
    pub(crate) response: Value,
}

#[async_trait]
impl ObjectService for FakeObjectService {
    async fn startDownload(
        &self,
        name: &str,
        payload: &Value,
    ) -> std::result::Result<Value, Error> {
        self.logger.log(format!(
            "startDownload {} {}",
            name, payload["acceptDownloadMethods"],
        ));
        Ok(self.response.clone())
    }
}

/// Fake implementation of the Queue service
pub(crate) struct FakeQueueService {
    pub(crate) logger: Logger,
    pub(crate) response: Value,
}

#[async_trait]
impl QueueService for FakeQueueService {
    async fn artifact(
        &self,
        task_id: &str,
        run_id: &str,
        name: &str,
    ) -> std::result::Result<Value, Error> {
        self.logger
            .log(format!("artifact {} {} {}", task_id, run_id, name,));
        Ok(self.response.clone())
    }

    async fn latestArtifact(&self, task_id: &str, name: &str) -> std::result::Result<Value, Error> {
        self.logger
            .log(format!("latestArtifact {} {}", task_id, name,));
        Ok(self.response.clone())
    }
}

/// A fake server of data blobs (like S3, but not trying to actually emulate S3).  Serves
/// b"hello, world" at the given URL.
pub(crate) struct FakeDataServer {
    server: httptest::Server,
}

impl FakeDataServer {
    /// Build an httptest::Server that responds with a sequence of responses.  For 200,
    /// the body is "hello, world".
    pub(crate) fn new(gzip_encoded: bool, responses: &[u16]) -> Self {
        let server = httptest::Server::run();
        server.expect(
            Expectation::matching(all_of![Dbg, request::method_path("GET", "/data"),])
                .times(..=responses.len())
                .respond_with(cycle(
                    responses
                        .iter()
                        .map(|response| {
                            let responder: Box<dyn Responder> = Box::new(if *response == 200 {
                                if gzip_encoded {
                                    status_code(200)
                                        .append_header("Content-Type", "text/plain")
                                        .append_header("Content-Encoding", "gzip")
                                        .body(GZIPPED_BODY)
                                } else {
                                    status_code(200)
                                        .append_header("Content-Type", "text/plain")
                                        .body(PLAINTEXT_BODY)
                                }
                            } else {
                                status_code(*response).body(&b""[..])
                            });
                            responder
                        })
                        .collect(),
                )),
        );
        Self { server }
    }

    pub(crate) fn data_url(&self) -> String {
        self.server.url_str("/data")
    }
}
