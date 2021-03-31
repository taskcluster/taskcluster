/*! Support for downloading data from the object service.

This crate provides a set of functions to download data from the object service.
These functions negotiate a download method with the object service, then perform the download, following all of the Taskcluster recommended practices.

Each function takes the necessary metadata for the download, a handle to the a destination for the data, and a [taskcluster::Object] client.
The destination can take a variety of forms, as described below.
The client must be configured with the necessary credentials to access the object service.

## Convenience Functions

Most uses of this crate can utilize one of the following convenience functions:

* [download_to_buf] -- download data to a fixed-size buffer;
* [download_to_vec] -- download data to a dynamically allocated buffer; or
* [download_to_file] -- writing to a [tokio::fs::File].

## Factories

A download may be retried, in which case the download function must have a means to truncate the data destination and begin writing from the beginning.
This is accomplished with the [`AsyncWriterFactory`](crate::AsyncWriterFactory) trait, which defines a `get_writer` method to generate a fresh [tokio::io::AsyncWrite] for each attempt.
Users for whom the supplied convenience functions are inadequate can add their own implementation of this trait.

 */
use anyhow::{anyhow, Context, Result};
use futures_util::stream::StreamExt;
use reqwest::header;
use serde_json::json;
use taskcluster::retry::{Backoff, Retry};
use taskcluster::Object;
use tokio::fs::File;
use tokio::io::copy;
use tokio_util::io::StreamReader;

mod factory;
mod service;

pub use factory::{AsyncWriterFactory, CursorWriterFactory, FileWriterFactory};
use service::ObjectService;

/// Download an object to a [Vec<u8>] and return that.  If the object is unexpectedly
/// large, this may exhaust system memory and panic.  Returns (data, content_type)
pub async fn download_to_vec(
    name: &str,
    retry: &Retry,
    object_service: &Object,
) -> Result<(Vec<u8>, String)> {
    let mut factory = CursorWriterFactory::new();
    let content_type = download_impl(name, retry, object_service, &mut factory).await?;
    Ok((factory.into_inner(), content_type))
}

/// Download an object into the given buffer and return the slice of that buffer containing the
/// object.  If the object is larger than the buffer, then resulting error can be downcast to
/// [std::io::Error] with kind `WriteZero` and the somewhat cryptic message "write zero byte into
/// writer".  Returns (slice, content_type)
pub async fn download_to_buf<'a>(
    name: &str,
    retry: &Retry,
    object_service: &Object,
    buf: &'a mut [u8],
) -> Result<(&'a [u8], String)> {
    let mut factory = CursorWriterFactory::for_buf(buf);
    let content_type = download_impl(name, retry, object_service, &mut factory).await?;
    let size = factory.size();
    Ok((&buf[..size], content_type))
}

/// Download an object into the given File.  The file must be open in write mode and must be
/// clone-able (that is, [File::try_clone()] must succeed) in order to support retried downloads.
/// The File is returned with all write operations complete but with unspecified position.
/// Returns (file, content_type).
pub async fn download_to_file(
    name: &str,
    retry: &Retry,
    object_service: &Object,
    file: File,
) -> Result<(File, String)> {
    let mut factory = FileWriterFactory::new(file);
    let content_type = download_impl(name, retry, object_service, &mut factory).await?;
    Ok((factory.into_inner().await?, content_type))
}

/// Download an object using an [AsyncWriterFactory].  This is useful for advanced cases where one
/// of the convenience functions is not adequate.  Returns the object's content type.
pub async fn download_with_factory<AWF: AsyncWriterFactory>(
    name: &str,
    retry: &Retry,
    object_service: &Object,
    writer_factory: &mut AWF,
) -> Result<String> {
    let content_type = download_impl(name, retry, object_service, writer_factory).await?;
    Ok(content_type)
}

/// Internal implementation of downloads, using the ObjectService trait to allow
/// injecting a fake dependency.  Returns the object's content-type.
async fn download_impl<O: ObjectService, AWF: AsyncWriterFactory>(
    name: &str,
    retry: &Retry,
    object_service: &O,
    writer_factory: &mut AWF,
) -> Result<String> {
    let response = object_service
        .startDownload(
            name,
            &json!({
                "acceptDownloadMethods": {
                    "simple": true,
                },
            }),
        )
        .await?;

    let mut backoff = Backoff::new(retry);
    let mut attempts = 0;
    loop {
        let res = simple_download(&response, writer_factory).await;
        attempts += 1;

        let res = match res {
            Ok(content_type) => return Ok(content_type),
            Err(err) => {
                if let Some(reqerr) = err.downcast_ref::<reqwest::Error>() {
                    if reqerr
                        .status()
                        .map(|s| s.is_client_error())
                        .unwrap_or(false)
                    {
                        return Err(err);
                    }
                }
                Err(err)
            }
        };

        match backoff.next_backoff() {
            Some(duration) => tokio::time::sleep(duration).await,
            None => return res.context(format!("Download failed after {} attempts", attempts)),
        }
    }
}

async fn simple_download<AWF: AsyncWriterFactory>(
    start_download_response: &serde_json::Value,
    writer_factory: &mut AWF,
) -> Result<String> {
    // simple method is simple!
    let url = start_download_response
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("invalid simple download response"))?;

    let res = reqwest::get(url).await?;
    res.error_for_status_ref()?;

    let default_content_type = "application/binary";
    let content_type = res
        .headers()
        .get(header::CONTENT_TYPE)
        .map(|h| h.to_str().unwrap_or(default_content_type))
        .unwrap_or(default_content_type)
        .to_owned();

    // copy bytes from the response to the writer
    let stream = res
        .bytes_stream()
        // convert the Result::Err type to std::io::Error
        .map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));
    let mut reader = StreamReader::new(stream);

    let mut writer = writer_factory.get_writer().await?;

    copy(&mut reader, &mut writer).await?;

    Ok(content_type)
}

#[cfg(test)]
mod test {
    use super::*;
    use anyhow::Error;
    use async_trait::async_trait;
    use httptest::{matchers::*, responders::*, Expectation};
    use serde_json::{json, Value};
    use std::fmt;
    use std::io::SeekFrom;
    use std::sync::Mutex;
    use tempfile::tempfile;
    use tokio::io::{AsyncReadExt, AsyncSeekExt};

    /// Event logger, used to log events in the fake ObjectService implementations
    #[derive(Default)]
    pub(crate) struct Logger {
        logged: Mutex<Vec<String>>,
    }

    impl Logger {
        pub(crate) fn log<S: Into<String>>(&self, message: S) {
            self.logged.lock().unwrap().push(message.into())
        }

        pub(crate) fn assert(&self, expected: Vec<String>) {
            assert_eq!(*self.logged.lock().unwrap(), expected);
        }
    }

    /// Log the matched value with `dbg!()` and always match.
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

    /// Fake implementation of the Object service, that supports the simple method
    struct SimpleDownload {
        logger: Logger,
        server: httptest::Server,
    }

    impl SimpleDownload {
        fn new(server: httptest::Server) -> Self {
            Self {
                logger: Logger::default(),
                server,
            }
        }
    }

    #[async_trait]
    impl ObjectService for SimpleDownload {
        async fn startDownload(
            &self,
            name: &str,
            payload: &Value,
        ) -> std::result::Result<Value, Error> {
            self.logger.log(format!(
                "startDownload {} {}",
                name, payload["acceptDownloadMethods"],
            ));
            Ok(json!({
                "method": "simple",
                "url": self.server.url_str("/data"),
            }))
        }
    }

    /// Build an httptest::Server that responds with a sequence of responses.  For 200,
    /// the body is "hello, world".
    fn data_server(responses: &[u16]) -> httptest::Server {
        let server = httptest::Server::run();
        server.expect(
            Expectation::matching(all_of![Dbg, request::method_path("GET", "/data"),])
                .times(..=responses.len())
                .respond_with(cycle(
                    responses
                        .iter()
                        .map(|response| {
                            let responder: Box<dyn Responder> = Box::new(if *response == 200 {
                                status_code(200)
                                    .append_header("Content-Type", "text/plain")
                                    .body("hello, world")
                            } else {
                                status_code(*response)
                            });
                            responder
                        })
                        .collect(),
                )),
        );
        server
    }

    #[tokio::test]
    async fn simple_download() -> Result<()> {
        let server = data_server(&[200]);
        let object_service = SimpleDownload::new(server);

        let mut factory = CursorWriterFactory::new();
        let content_type = download_impl(
            "some/object",
            &Retry::default(),
            &object_service,
            &mut factory,
        )
        .await?;

        object_service.logger.assert(vec![format!(
            "startDownload some/object {}",
            json!({"simple": true})
        )]);

        assert_eq!(&content_type, "text/plain");

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    #[tokio::test]
    async fn simple_download_with_retries_for_500s_success() -> Result<()> {
        let server = data_server(&[500, 500, 200]);
        let object_service = SimpleDownload::new(server);
        let retry = Retry {
            retries: 2,
            ..Retry::default()
        };

        let mut factory = CursorWriterFactory::new();
        download_impl("some/object", &retry, &object_service, &mut factory).await?;

        object_service.logger.assert(vec![format!(
            "startDownload some/object {}",
            json!({"simple": true})
        )]);

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    #[tokio::test]
    async fn simple_download_with_failure_for_400s() -> Result<()> {
        let server = data_server(&[400, 200]);
        let object_service = SimpleDownload::new(server);
        let retry = Retry::default();

        let mut factory = CursorWriterFactory::new();
        assert!(
            download_impl("some/object", &retry, &object_service, &mut factory)
                .await
                .is_err()
        );

        object_service.logger.assert(vec![format!(
            "startDownload some/object {}",
            json!({"simple": true})
        )]);

        let data = factory.into_inner();
        assert_eq!(&data, b"");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    #[tokio::test]
    async fn simple_download_with_retries_for_500s_failure() -> Result<()> {
        let server = data_server(&[500, 500, 500, 200]);
        let object_service = SimpleDownload::new(server);
        let retry = Retry {
            retries: 2, // but, need 3 to succeed!
            ..Retry::default()
        };

        let mut factory = CursorWriterFactory::new();
        assert!(
            download_impl("some/object", &retry, &object_service, &mut factory)
                .await
                .is_err()
        );

        object_service.logger.assert(vec![format!(
            "startDownload some/object {}",
            json!({"simple": true})
        )]);

        let data = factory.into_inner();
        assert_eq!(&data, b"");

        drop(object_service);

        Ok(())
    }

    #[tokio::test]
    async fn simple_download_to_file() -> Result<()> {
        let server = data_server(&[200]);
        let object_service = SimpleDownload::new(server);

        let mut factory = FileWriterFactory::new(tempfile()?.into());
        download_impl(
            "some/object",
            &Retry::default(),
            &object_service,
            &mut factory,
        )
        .await?;

        object_service.logger.assert(vec![format!(
            "startDownload some/object {}",
            json!({"simple": true})
        )]);

        let mut file = factory.into_inner().await?;
        let mut res = Vec::new();
        file.seek(SeekFrom::Start(0)).await?;
        file.read_to_end(&mut res).await?;
        assert_eq!(&res, b"hello, world");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }
}
