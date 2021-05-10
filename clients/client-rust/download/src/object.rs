use crate::factory::{AsyncWriterFactory, CursorWriterFactory, FileWriterFactory};
use crate::geturl::{get_url, RetriableResult};
use crate::service::ObjectService;
use anyhow::{anyhow, Context, Result};
use serde_json::json;
use taskcluster::retry::{Backoff, Retry};
use taskcluster::Object;
use tokio::fs::File;

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
pub(crate) async fn download_impl<O: ObjectService, AWF: AsyncWriterFactory>(
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

    // assume the response is a simple download, as that's the only current option
    let content_type = simple_download(&response, retry, writer_factory).await?;
    Ok(content_type)
}

async fn simple_download<AWF: AsyncWriterFactory>(
    start_download_response: &serde_json::Value,
    retry: &Retry,
    writer_factory: &mut AWF,
) -> Result<String> {
    // simple method is simple!
    let url = start_download_response
        .get("url")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow!("invalid simple download response"))?;

    let mut backoff = Backoff::new(retry);
    let mut attempts = 0;

    loop {
        attempts += 1;
        match get_url(url, writer_factory).await {
            RetriableResult::Ok(content_type) => return Ok(content_type),
            RetriableResult::Retriable(err) => match backoff.next_backoff() {
                Some(duration) => {
                    tokio::time::sleep(duration).await;
                    continue;
                }
                None => {
                    return Err(err).context(format!("Download failed after {} attempts", attempts))
                }
            },
            RetriableResult::Permanent(err) => {
                return Err(err);
            }
        }
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::test_helpers::{FakeDataServer, FakeObjectService, Logger};
    use serde_json::json;
    use std::io::SeekFrom;
    use tempfile::tempfile;
    use tokio::io::{AsyncReadExt, AsyncSeekExt};

    #[tokio::test]
    async fn simple_download() -> Result<()> {
        let server = FakeDataServer::new(false, &[200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "simple",
                "url": server.data_url(),
            }),
        };

        let mut factory = CursorWriterFactory::new();
        let content_type = download_impl(
            "some/object",
            &Retry::default(),
            &object_service,
            &mut factory,
        )
        .await?;

        logger.assert(vec![format!(
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
        let server = FakeDataServer::new(false, &[500, 500, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "simple",
                "url": server.data_url(),
            }),
        };
        let retry = Retry {
            retries: 2,
            ..Retry::default()
        };

        let mut factory = CursorWriterFactory::new();
        download_impl("some/object", &retry, &object_service, &mut factory).await?;

        logger.assert(vec![format!(
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
        let server = FakeDataServer::new(false, &[400, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "simple",
                "url": server.data_url(),
            }),
        };
        let retry = Retry::default();

        let mut factory = CursorWriterFactory::new();
        assert!(
            download_impl("some/object", &retry, &object_service, &mut factory)
                .await
                .is_err()
        );

        logger.assert(vec![format!(
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
        let server = FakeDataServer::new(false, &[500, 500, 500, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "simple",
                "url": server.data_url(),
            }),
        };
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

        logger.assert(vec![format!(
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
        let server = FakeDataServer::new(false, &[200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "simple",
                "url": server.data_url(),
            }),
        };

        let mut factory = FileWriterFactory::new(tempfile()?.into());
        download_impl(
            "some/object",
            &Retry::default(),
            &object_service,
            &mut factory,
        )
        .await?;

        logger.assert(vec![format!(
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
