/*! Advanced support for downloading files from the object service.

## Factories

A download may be retried, in which case the download function must have a means to truncate the data
destination and begin writing from the beginning.  This is accomplished with the
[`AsyncWriterFactory`](crate::download::AsyncWriterFactory) trait, which defines a `get_writer`
method to generate a fresh `AsyncWriter` for each attempt.  Users for whom the supplied factory
implementations are inadequate can add their own implementation of this trait.
 */
use crate::Object;
use anyhow::{anyhow, Result};
use futures_util::stream::StreamExt;
use serde_json::json;
use tokio::fs::File;
use tokio::io::copy;
use tokio_util::io::StreamReader;

mod factory;
mod service;

pub use factory::{AsyncWriterFactory, CursorWriterFactory, FileWriterFactory};
use service::ObjectService;

/// Download an object to a `Vec<u8>` and return that.  If the object is unexpectedly
/// large, this may exhaust system memory and panic.
pub async fn download_to_vec(name: &str, object_service: &Object) -> Result<Vec<u8>> {
    let mut factory = CursorWriterFactory::new();
    download_impl(name, object_service, &mut factory).await?;
    Ok(factory.into_inner())
}

/// Download an object into the given buffer and return the slice of that buffer containing the
/// object.  If the object is larger than the buffer, then resulting error can be downcast to
/// `std::io::Error` with kind `WriteZero` and the somewhat cryptic message "write zero byte into
/// writer".
pub async fn download_to_buf<'a>(
    name: &str,
    object_service: &Object,
    buf: &'a mut [u8],
) -> Result<&'a [u8]> {
    let mut factory = CursorWriterFactory::for_buf(buf);
    download_impl(name, object_service, &mut factory).await?;
    let size = factory.size();
    Ok(&buf[..size])
}

/// Download an object into the given File.  The file must be open in write mode and must be
/// clone-able (that is, `file.try_clone()` must succeed) in order to support retried downloads.
/// The File is returned with all write operations complete but with unspecified position.
pub async fn download_to_file(name: &str, object_service: &Object, file: File) -> Result<File> {
    let mut factory = FileWriterFactory::new(file);
    download_impl(name, object_service, &mut factory).await?;
    Ok(factory.into_inner().await?)
}

/// Download an object using an AsyncWriterFactory.  This is useful for
/// advanced cases where one of the convenience functions is not adequate.
pub async fn download_with_factory<AWF: AsyncWriterFactory>(
    name: &str,
    object_service: &Object,
    writer_factory: &mut AWF,
) -> Result<()> {
    download_impl(name, object_service, writer_factory).await
}

/// Internal implementation of downloads, using the ObjectService trait to allow
/// injecting a fake dependency
async fn download_impl<O: ObjectService, AWF: AsyncWriterFactory>(
    name: &str,
    object_service: &O,
    writer_factory: &mut AWF,
) -> Result<()> {
    let res = object_service
        .startDownload(
            name,
            &json!({
                "acceptDownloadMethods": {
                    "simple": true,
                },
            }),
        )
        .await?;

    // TODO: retries

    // simple method is simple!
    let url = res
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("invalid simple download response"))?;

    let res = reqwest::get(url).await?;

    // copy bytes from the response to the writer
    let stream = res.bytes_stream();
    let stream =
            // convert the Result::Err type to std::io::Error
            stream.map(|r| r.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)));
    let mut reader = StreamReader::new(stream);

    let mut writer = writer_factory.get_writer().await?;

    copy(&mut reader, &mut writer).await?;

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::test::{Dbg, Logger};
    use anyhow::Error;
    use async_trait::async_trait;
    use httptest::{matchers::*, responders::*, Expectation};
    use serde_json::{json, Value};
    use std::io::SeekFrom;
    use tempfile::tempfile;
    use tokio::io::{AsyncReadExt, AsyncSeekExt};

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
        for response in responses {
            server.expect(
                Expectation::matching(all_of![Dbg, request::method_path("GET", "/data"),])
                    .times(1)
                    .respond_with(if *response == 200 {
                        status_code(200).body("hello, world")
                    } else {
                        status_code(*response)
                    }),
            );
        }
        server
    }

    #[tokio::test]
    async fn simple_download() -> Result<()> {
        let server = data_server(&[200]);
        let object_service = SimpleDownload::new(server);

        let mut factory = CursorWriterFactory::new();
        download_impl("some/object", &object_service, &mut factory).await?;

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
    async fn simple_download_to_file() -> Result<()> {
        let server = data_server(&[200]);
        let object_service = SimpleDownload::new(server);

        let mut factory = FileWriterFactory::new(tempfile()?.into());
        download_impl("some/object", &object_service, &mut factory).await?;

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
