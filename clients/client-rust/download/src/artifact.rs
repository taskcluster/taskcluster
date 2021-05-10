use crate::factory::{AsyncWriterFactory, CursorWriterFactory, FileWriterFactory};
use crate::geturl::{get_url, RetriableResult};
use crate::object::download_impl;
use crate::service::{ObjectService, QueueService};
use anyhow::{anyhow, bail, Context, Result};
use taskcluster::retry::{Backoff, Retry};
use taskcluster::{ClientBuilder, Credentials, Object, Queue};
use tokio::fs::File;

/// Download an artifact to a [Vec<u8>] and return that.  If the artifact is unexpectedly large,
/// this may exhaust system memory and panic.  If `run_id` is None then the latest run will be
/// used.  Returns (data, content_type).
pub async fn download_artifact_to_vec(
    task_id: &str,
    run_id: Option<&str>,
    name: &str,
    retry: &Retry,
    queue_service: &Queue,
) -> Result<(Vec<u8>, String)> {
    let mut factory = CursorWriterFactory::new();
    let content_type = download_artifact_impl(
        task_id,
        run_id,
        name,
        retry,
        queue_service,
        object_service_factory,
        &mut factory,
    )
    .await?;
    Ok((factory.into_inner(), content_type))
}

/// Download an artifact into the given buffer and return the slice of that buffer containing the
/// artifact.  If the artifact is larger than the buffer, then resulting error can be downcast to
/// [std::io::Error] with kind `WriteZero` and the somewhat cryptic message "write zero byte into
/// writer".  Returns (slice, content_type).  If `run_id` is None then the latest run will be used.
pub async fn download_artifact_to_buf<'a>(
    task_id: &str,
    run_id: Option<&str>,
    name: &str,
    retry: &Retry,
    queue_service: &Queue,
    buf: &'a mut [u8],
) -> Result<(&'a [u8], String)> {
    let mut factory = CursorWriterFactory::for_buf(buf);
    let content_type = download_artifact_impl(
        task_id,
        run_id,
        name,
        retry,
        queue_service,
        object_service_factory,
        &mut factory,
    )
    .await?;
    let size = factory.size();
    Ok((&buf[..size], content_type))
}

/// Download an artifact into the given File.  The file must be open in write mode and must be
/// clone-able (that is, [File::try_clone()] must succeed) in order to support retried downloads.
/// The File is returned with all write operations complete but with unspecified position.  If
/// `run_id` is None then the latest run will be used.  Returns (file, content_type).
pub async fn download_artifact_to_file(
    task_id: &str,
    run_id: Option<&str>,
    name: &str,
    retry: &Retry,
    queue_service: &Queue,
    file: File,
) -> Result<(File, String)> {
    let mut factory = FileWriterFactory::new(file);
    let content_type = download_artifact_impl(
        task_id,
        run_id,
        name,
        retry,
        queue_service,
        object_service_factory,
        &mut factory,
    )
    .await?;
    Ok((factory.into_inner().await?, content_type))
}

/// Download an artifact using an [AsyncWriterFactory].  This is useful for advanced cases where one
/// of the convenience functions is not adequate.  Returns the artifact's content type.  If
/// `run_id` is None then the latest run will be used.  Returns the content type.
pub async fn download_artifact_with_factory<AWF: AsyncWriterFactory>(
    task_id: &str,
    run_id: Option<&str>,
    name: &str,
    retry: &Retry,
    queue_service: &Queue,
    writer_factory: &mut AWF,
) -> Result<String> {
    let content_type = download_artifact_impl(
        task_id,
        run_id,
        name,
        retry,
        queue_service,
        object_service_factory,
        writer_factory,
    )
    .await?;
    Ok(content_type)
}

/// Create an object service client with the given credentials and retry configuration.
/// This allows injection of fake object services during testing.
fn object_service_factory(queue: &Queue, creds: Credentials, retry: &Retry) -> Result<Object> {
    Object::new(
        ClientBuilder::new(queue.client.root_url())
            .credentials(creds)
            .retry(retry.clone()),
    )
}

async fn download_artifact_impl<Q, O, OF, AWF>(
    task_id: &str,
    run_id: Option<&str>,
    name: &str,
    retry: &Retry,
    queue_service: &Q,
    object_service_factory: OF,
    writer_factory: &mut AWF,
) -> Result<String>
where
    Q: QueueService,
    O: ObjectService,
    OF: FnOnce(&Q, Credentials, &Retry) -> Result<O>,
    AWF: AsyncWriterFactory,
{
    let artifact = if let Some(run_id) = run_id {
        queue_service.artifact(task_id, run_id, name).await?
    } else {
        queue_service.latestArtifact(task_id, name).await?
    };

    fn get_str<'a>(v: &'a serde_json::Value, name: &str, p: &str) -> Result<&'a str> {
        Ok(v.get(p)
            .ok_or_else(|| anyhow!("{} property {} not found", name, p))?
            .as_str()
            .ok_or_else(|| anyhow!("{} property {} is not a string", name, p))?)
    }

    let storage_type = get_str(&artifact, "artifact", "storageType")?;
    match storage_type {
        "s3" | "reference" => {
            let url = get_str(&artifact, "artifact", "url")?;
            return download_url(url, retry, writer_factory).await;
        }
        "object" => {
            // create a new object-service client based on the given credentials
            let creds_json = artifact
                .get("credentials")
                .ok_or_else(|| anyhow!("Artifact property credentials not found"))?;
            let client_id = get_str(&creds_json, "artifact.credentials", "client_id")?;
            let access_token = get_str(&creds_json, "artifact.credentials", "access_token")?;
            // certificate may not be present
            let certificate_res = get_str(&creds_json, "artifact.credentials", "certificate");
            let creds = if let Ok(certificate) = certificate_res {
                Credentials::new_with_certificate(client_id, access_token, certificate)
            } else {
                Credentials::new(client_id, access_token)
            };
            let object_service = object_service_factory(queue_service, creds, retry)?;

            let name = get_str(&artifact, "artifact", "name")?;

            // defer to the object-service download support
            return download_impl(name, retry, &object_service, writer_factory).await;
        }
        "error" => {
            let message = get_str(&artifact, "artifact", "message")?;
            let reason = get_str(&artifact, "artifact", "reason")?;
            // this looks backward, but results in an Error with "{message}.. caused by {reason}"
            return Err(anyhow!("{}", reason).context(format!("Error Artifact: {}", message)));
        }
        st => bail!("Unknown artifact storageType {}", st),
    };
}

async fn download_url<AWF: AsyncWriterFactory>(
    url: &str,
    retry: &Retry,
    writer_factory: &mut AWF,
) -> Result<String> {
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
    use crate::test_helpers::{FakeDataServer, FakeObjectService, FakeQueueService, Logger};
    use serde_json::json;

    /// object_service_factory function for cases where the object service is not used
    fn unused_object_service_factory(
        _queue: &FakeQueueService,
        _creds: Credentials,
        _retry: &Retry,
    ) -> Result<Object> {
        unreachable!()
    }

    #[tokio::test]
    async fn s3_artifact_with_retry() -> Result<()> {
        let server = FakeDataServer::new(true, &[500, 200]);
        let mut factory = CursorWriterFactory::new();
        let logger = Logger::default();
        let queue_service = FakeQueueService {
            logger: logger.clone(),
            response: json!({
                "storageType": "s3",
                "url": server.data_url(),
            }),
        };

        let content_type = download_artifact_impl(
            "LyTqA-MYReaNrLTYYHyrtw",
            Some("1"),
            "public/thing.txt",
            &Retry::default(),
            &queue_service,
            unused_object_service_factory,
            &mut factory,
        )
        .await?;

        logger.assert(vec![
            "artifact LyTqA-MYReaNrLTYYHyrtw 1 public/thing.txt".to_owned()
        ]);

        assert_eq!(&content_type, "text/plain");

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        Ok(())
    }

    #[tokio::test]
    async fn s3_latest_artifact_with_retry() -> Result<()> {
        let server = FakeDataServer::new(true, &[500, 200]);
        let mut factory = CursorWriterFactory::new();
        let logger = Logger::default();
        let queue_service = FakeQueueService {
            logger: logger.clone(),
            response: json!({
                "storageType": "s3",
                "url": server.data_url(),
            }),
        };

        let content_type = download_artifact_impl(
            "LyTqA-MYReaNrLTYYHyrtw",
            None,
            "public/thing.txt",
            &Retry::default(),
            &queue_service,
            unused_object_service_factory,
            &mut factory,
        )
        .await?;

        logger.assert(vec![
            "latestArtifact LyTqA-MYReaNrLTYYHyrtw public/thing.txt".to_owned(),
        ]);

        assert_eq!(&content_type, "text/plain");

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        Ok(())
    }

    #[tokio::test]
    async fn object_artifact() -> Result<()> {
        let server = FakeDataServer::new(false, &[200]);
        let mut factory = CursorWriterFactory::new();
        let logger = Logger::default();
        let queue_service = FakeQueueService {
            logger: logger.clone(),
            response: json!({
                "storageType": "object",
                "name": "artifacts/data",
                "credentials": {
                    "client_id": "c",
                    "access_token": "a",
                    "certificate": "cert",
                },
            }),
        };

        let object_service_factory = {
            let logger = logger.clone();
            let url = server.data_url();
            move |_queue: &FakeQueueService, creds: Credentials, _retry: &Retry| {
                assert_eq!(creds.client_id, "c");
                assert_eq!(creds.access_token, "a");
                assert_eq!(creds.certificate, Some("cert".to_owned()));
                Ok(FakeObjectService {
                    logger,
                    response: json!({
                        "method": "simple",
                        "url": url,
                    }),
                })
            }
        };
        let content_type = download_artifact_impl(
            "LyTqA-MYReaNrLTYYHyrtw",
            Some("2"),
            "public/thing.txt",
            &Retry::default(),
            &queue_service,
            object_service_factory,
            &mut factory,
        )
        .await?;

        logger.assert(vec![
            "artifact LyTqA-MYReaNrLTYYHyrtw 2 public/thing.txt".to_owned(),
            "startDownload artifacts/data {\"simple\":true}".to_owned(),
        ]);

        assert_eq!(&content_type, "text/plain");

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        Ok(())
    }

    #[tokio::test]
    async fn object_artifact_no_cert() -> Result<()> {
        let server = FakeDataServer::new(false, &[200]);
        let mut factory = CursorWriterFactory::new();
        let logger = Logger::default();
        let queue_service = FakeQueueService {
            logger: logger.clone(),
            response: json!({
                "storageType": "object",
                "name": "artifacts/data",
                "credentials": {
                    "client_id": "c",
                    "access_token": "a",
                    // no certificate
                },
            }),
        };

        let object_service_factory = {
            let logger = logger.clone();
            let url = server.data_url();
            move |_queue: &FakeQueueService, creds: Credentials, _retry: &Retry| {
                assert_eq!(creds.client_id, "c");
                assert_eq!(creds.access_token, "a");
                assert_eq!(creds.certificate, None);
                Ok(FakeObjectService {
                    logger,
                    response: json!({
                        "method": "simple",
                        "url": url,
                    }),
                })
            }
        };
        let content_type = download_artifact_impl(
            "LyTqA-MYReaNrLTYYHyrtw",
            Some("2"),
            "public/thing.txt",
            &Retry::default(),
            &queue_service,
            object_service_factory,
            &mut factory,
        )
        .await?;

        logger.assert(vec![
            "artifact LyTqA-MYReaNrLTYYHyrtw 2 public/thing.txt".to_owned(),
            "startDownload artifacts/data {\"simple\":true}".to_owned(),
        ]);

        assert_eq!(&content_type, "text/plain");

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        Ok(())
    }

    #[tokio::test]
    async fn error_artifact() -> Result<()> {
        let mut factory = CursorWriterFactory::new();
        let logger = Logger::default();
        let queue_service = FakeQueueService {
            logger: logger.clone(),
            response: json!({
                "storageType": "error",
                "message": "uhoh",
                "reason": "test case",
            }),
        };

        let res = download_artifact_impl(
            "LyTqA-MYReaNrLTYYHyrtw",
            None,
            "public/thing.txt",
            &Retry::default(),
            &queue_service,
            unused_object_service_factory,
            &mut factory,
        )
        .await;

        logger.assert(vec![
            "latestArtifact LyTqA-MYReaNrLTYYHyrtw public/thing.txt".to_owned(),
        ]);

        let err = res.expect_err("Should have returned an Err");
        assert_eq!(format!("{}", err), "Error Artifact: uhoh");
        assert_eq!(format!("{}", err.root_cause()), "test case");

        Ok(())
    }
}
