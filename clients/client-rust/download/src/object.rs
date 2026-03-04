use crate::factory::{AsyncWriterFactory, CursorWriterFactory, FileWriterFactory};
use crate::geturl::{get_url, FetchMetadata, RetriableResult};
use crate::hashing::HasherAsyncWriterFactory;
use crate::service::ObjectService;
use anyhow::{anyhow, bail, Context, Result};
use serde_json::json;
use std::collections::HashMap;
use taskcluster::chrono::{DateTime, Utc};
use taskcluster::retry::{Backoff, Retry};
use taskcluster::Object;
use tokio::fs::File;

/// The subset of hashes supported by hashing{read,write}stream which are
/// "accepted" as per the object service's schemas.
const ACCEPTABLE_HASHES: &'static [&'static str] = &["sha256", "sha512"];

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
                    "getUrl": true,
                },
            }),
        )
        .await?;

    let method = response
        .get("method")
        .map(|o| o.as_str())
        .flatten()
        .ok_or_else(|| anyhow!("invalid response from startDownload"))?;

    match method {
        "getUrl" => {
            Ok(geturl_download(response, name, object_service, retry, writer_factory).await?)
        }
        _ => bail!("unknown method {} in response from startDownload", method),
    }
}

async fn geturl_download<O: ObjectService, AWF: AsyncWriterFactory>(
    mut response_json: serde_json::Value,
    name: &str,
    object_service: &O,
    retry: &Retry,
    writer_factory: &mut AWF,
) -> Result<String> {
    // tracking for whether the URL in start_download_response has been used
    // at least once, to avoid looping infinitely.
    let mut response_used = false;
    #[derive(serde::Deserialize)]
    struct GetUrlStartDownloadResponse {
        url: String,
        hashes: HashMap<String, String>,
        expires: DateTime<Utc>,
    }

    let mut start_download_response: GetUrlStartDownloadResponse =
        serde_json::from_value(response_json)?;

    // wrap the given writer factory with one that will hash
    let mut writer_factory = HasherAsyncWriterFactory::new(writer_factory);

    let mut backoff = Backoff::new(retry);
    let mut attempts = 0;

    let fetchmeta = loop {
        if response_used && start_download_response.expires <= Utc::now() {
            response_json = object_service
                .startDownload(
                    name,
                    &json!({
                        "acceptDownloadMethods": {
                            "getUrl": true,
                        },
                    }),
                )
                .await?;
            start_download_response = serde_json::from_value(response_json)?;
        }

        response_used = true;
        attempts += 1;
        let mut writer = writer_factory.get_writer().await?;
        match get_url(start_download_response.url.as_ref(), writer.as_mut()).await {
            RetriableResult::Ok(fetchmeta) => break Ok::<FetchMetadata, anyhow::Error>(fetchmeta),
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
    }?;

    // Verify the hashes after a successful download.  Note that verification failure will
    // not result in a retry.
    verify_hashes(start_download_response.hashes, writer_factory.hashes())?;

    Ok(fetchmeta.content_type)
}

/// Validate that the observed hashes match the expected hashes: all hashes with known algorithms
/// present in both maps are valid, and at least one "accepted" hash algorithm is present.
///
/// If the validation fails, this returns an appropriate error.
fn verify_hashes(
    exp_hashes: HashMap<String, String>,
    observed_hashes: HashMap<String, String>,
) -> Result<()> {
    let mut some_valid_acceptable_hash = false;

    for (alg, ov) in &observed_hashes {
        if let Some(ev) = exp_hashes.get(alg) {
            if ov != ev {
                bail!("Object hashes for {} differ", alg);
            }
            if ACCEPTABLE_HASHES.iter().any(|acc_alg| alg == acc_alg) {
                some_valid_acceptable_hash = true;
            }
        }
    }

    if !some_valid_acceptable_hash {
        bail!("No acceptable hashes found in object metadata");
    }
    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::test_helpers::{FakeDataServer, FakeObjectService, Logger};
    use serde_json::json;
    use std::io::SeekFrom;
    use taskcluster::chrono::{Duration, Utc};
    use tempfile::tempfile;
    use tokio::io::{AsyncReadExt, AsyncSeekExt};

    #[tokio::test]
    async fn download_success() -> Result<()> {
        let server = FakeDataServer::new(false, &[200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "getUrl",
                "url": server.data_url(),
                "hashes": {
                    "sha256":"09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b",
                },
                "expires": Utc::now() + Duration::hours(2),
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
            json!({"getUrl": true})
        )]);

        assert_eq!(&content_type, "text/plain");

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    #[tokio::test]
    async fn download_with_retries_for_500s_success() -> Result<()> {
        let server = FakeDataServer::new(false, &[500, 500, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "getUrl",
                "url": server.data_url(),
                "hashes": {
                    "sha256":"09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b",
                },
                "expires": Utc::now() + Duration::hours(2),
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
            json!({"getUrl": true})
        )]);

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    #[tokio::test]
    async fn download_with_failure_for_400s() -> Result<()> {
        let server = FakeDataServer::new(false, &[400, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "getUrl",
                "url": server.data_url(),
                "hashes": {},
                "expires": Utc::now() + Duration::hours(2),
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
            json!({"getUrl": true})
        )]);

        let data = factory.into_inner();
        assert_eq!(&data, b"");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    #[tokio::test]
    async fn download_with_retries_for_500s_failure() -> Result<()> {
        let server = FakeDataServer::new(false, &[500, 500, 500, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "getUrl",
                "url": server.data_url(),
                "hashes": {},
                "expires": Utc::now() + Duration::hours(2),
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
            json!({"getUrl": true})
        )]);

        let data = factory.into_inner();
        assert_eq!(&data, b"");

        drop(object_service);

        Ok(())
    }

    #[tokio::test]
    async fn download_calls_start_download_when_expired() -> Result<()> {
        let server = FakeDataServer::new(false, &[500, 200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "getUrl",
                "url": server.data_url(),
                "hashes": {},
                "expires": Utc::now(), // download_impl will try the url once
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

        logger.assert(vec![
            // calls startDownload twice
            format!("startDownload some/object {}", json!({"getUrl": true})),
            format!("startDownload some/object {}", json!({"getUrl": true})),
        ]);

        let data = factory.into_inner();
        assert_eq!(&data, b"hello, world");

        drop(object_service);

        Ok(())
    }

    #[tokio::test]
    async fn download_to_file() -> Result<()> {
        let server = FakeDataServer::new(false, &[200]);
        let logger = Logger::default();
        let object_service = FakeObjectService {
            logger: logger.clone(),
            response: json!({
                "method": "getUrl",
                "url": server.data_url(),
                "hashes": {
                    "sha256":"09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b",
                },
                "expires": Utc::now() + Duration::hours(2),
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
            json!({"getUrl": true})
        )]);

        let mut file = factory.into_inner().await?;
        let mut res = Vec::new();
        file.seek(SeekFrom::Start(0)).await?;
        file.read_to_end(&mut res).await?;
        assert_eq!(&res, b"hello, world");

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }

    macro_rules! strmap {
		($( $key:literal : $val:expr ),*) => {
			{
				let mut m: HashMap::<String, String> = HashMap::new();
				$(
				m.insert($key.into(), $val.into());
				)*
				m
			}
		};
		($( $key:literal : $val:expr ),* ,) => {
            strmap!($( $key : $val ,)*)
        };
	}

    #[test]
    fn verify_hashes_valid() {
        assert!(verify_hashes(
            strmap!("sha256": "abc", "sha512": "def", "md5": "ignored"),
            strmap!("sha256": "abc", "sha512": "def", "sha1024": "ignored")
        )
        .is_ok());
    }

    #[test]
    fn verify_hashes_not_acceptable() {
        assert!(verify_hashes(strmap!("md5": "abc"), strmap!("md5": "abc")).is_err());
    }

    #[test]
    fn verify_hashes_not_matching() {
        assert!(verify_hashes(strmap!("sha512": "abc"), strmap!("sha512": "def")).is_err());
    }

    #[test]
    fn verify_hashes_not_acceptable_not_matching() {
        assert!(verify_hashes(
            strmap!("md5": "good", "sha512": "abc"),
            strmap!("md5": "good", "sha512": "def")
        )
        .is_err());
    }
}
