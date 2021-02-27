/*! Support for uploading data to the Taskcluster object server.

This crate provides a set of functions to perform an object-service upload.
These functions negotiate an upload method with the object service, and then perform the upload, following all of the Taskcluster recommended practices.

Each function takes the necessary metadata for the upload, a handle to the data to be uploaded, and a [taskcluster::Object] client.
The data to be uploaded can come in a variety of forms, described below.
The client must be configured with the necessary credentials to access the object service.

## Convenience Functions

Most uses of this crate can utilize [upload_from_buf] or [upload_from_file], providing the data in the form of a buffer and a [tokio::fs::File], respectively.

## Factories

An upload may be retried, in which case the upload function must have access to the object data from the beginning.
This is accomplished with the [`AsyncReaderFactory`](crate::AsyncReaderFactory) trait, which defines a `get_reader` method to generate a fresh [tokio::io::AsyncRead] for each attempt.
Users for whom the supplied convenience functions are inadequate can add their own implementation of this trait.

 */
use anyhow::{bail, Context, Result};
use reqwest::Body;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use taskcluster::chrono::{DateTime, Utc};
use taskcluster::retry::{Backoff, Retry};
use taskcluster::Object;
use tokio::fs::File;
use tokio::io::{AsyncRead, AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::codec::{BytesCodec, FramedRead};

mod factory;
mod service;

pub use factory::{AsyncReaderFactory, CursorReaderFactory, FileReaderFactory};
use service::ObjectService;

const DATA_INLINE_MAX_SIZE: u64 = 8192;

/// Upload an object from an in-memory buffer.
pub async fn upload_from_buf(
    project_id: &str,
    name: &str,
    content_type: &str,
    expires: &DateTime<Utc>,
    data: &[u8],
    retry: &Retry,
    object_service: &Object,
) -> Result<()> {
    upload_with_factory(
        project_id,
        name,
        content_type,
        data.len() as u64,
        expires,
        CursorReaderFactory::new(data),
        retry,
        object_service,
    )
    .await
}

/// Upload an object from a File.  The file must be open in read mode and must be clone-able (that
/// is, [File::try_clone()] must succeed) in order to support retried uploads.
pub async fn upload_from_file(
    project_id: &str,
    name: &str,
    content_type: &str,
    expires: &DateTime<Utc>,
    mut file: File,
    retry: &Retry,
    object_service: &Object,
) -> Result<()> {
    let content_length = file.seek(SeekFrom::End(0)).await?;
    upload_with_factory(
        project_id,
        name,
        content_type,
        content_length,
        expires,
        FileReaderFactory::new(file),
        retry,
        object_service,
    )
    .await
}

/// Upload an object using an AsyncReaderFactory.  This is useful for advanced cases where one of
/// the convenience functions is not adequate.
pub async fn upload_with_factory<ARF: AsyncReaderFactory>(
    project_id: &str,
    name: &str,
    content_type: &str,
    content_length: u64,
    expires: &DateTime<Utc>,
    reader_factory: ARF,
    retry: &Retry,
    object_service: &Object,
) -> Result<()> {
    let upload_id = slugid::v4();
    upload_impl(
        project_id,
        name,
        content_type,
        content_length,
        expires,
        reader_factory,
        retry,
        object_service,
        &upload_id,
    )
    .await
}

/// Internal implementation of downloads, using the ObjectService trait to allow
/// injecting a fake dependency
async fn upload_impl<O: ObjectService, ARF: AsyncReaderFactory>(
    project_id: &str,
    name: &str,
    content_type: &str,
    content_length: u64,
    expires: &DateTime<Utc>,
    mut reader_factory: ARF,
    retry: &Retry,
    object_service: &O,
    upload_id: &str,
) -> Result<()> {
    let mut proposed_upload_methods = json!({});

    // if the data is short enough, try a data-inline upload
    if content_length < DATA_INLINE_MAX_SIZE {
        let mut buf = vec![];
        let mut reader = reader_factory.get_reader().await?;
        reader.read_to_end(&mut buf).await?;
        let data_b64 = base64::encode(buf);
        proposed_upload_methods["dataInline"] = json!({
            "contentType": content_type,
            "objectData": data_b64,
        });
    }

    // in any case, try a put-url upload
    proposed_upload_methods["putUrl"] = json!({
        "contentType": content_type,
        "contentLength": content_length,
    });

    // send the request to the object service
    let create_upload_res = object_service
        .createUpload(
            name,
            &json!({
                "expires": expires,
                "projectId": project_id,
                "uploadId": upload_id,
                "proposedUploadMethods": proposed_upload_methods,
            }),
        )
        .await?;

    let mut backoff = Backoff::new(retry);
    let mut attempts = 0u32;
    loop {
        // actually upload the data
        let res: Result<()> = if create_upload_res
            .pointer("/uploadMethod/dataInline")
            .is_some()
        {
            Ok(()) // nothing to do - data is already in place
        } else if let Some(method) = create_upload_res.pointer("/uploadMethod/putUrl") {
            let reader = reader_factory.get_reader().await?;
            simple_upload(reader, content_length, method.clone()).await
        } else {
            bail!("Could not negotiate an upload method") // not retriable
        };

        attempts += 1;
        match &res {
            Ok(_) => break,
            Err(err) => {
                if let Some(reqerr) = err.downcast_ref::<reqwest::Error>() {
                    if reqerr
                        .status()
                        .map(|s| s.is_client_error())
                        .unwrap_or(false)
                    {
                        return res;
                    }
                }
            }
        }

        match backoff.next_backoff() {
            Some(duration) => tokio::time::sleep(duration).await,
            None => return res.context(format!("Download failed after {} attempts", attempts)),
        }
    }

    // finish the upload
    object_service
        .finishUpload(
            name,
            &json!({
                "projectId": project_id,
                "uploadId": upload_id,
            }),
        )
        .await?;

    Ok(())
}

/// Perform a simple upload, given the `method` property of the response from createUpload.
async fn simple_upload(
    reader: Box<dyn AsyncRead + Sync + Send + Unpin + 'static>,
    content_length: u64,
    upload_method: Value,
) -> Result<()> {
    #[derive(Deserialize)]
    struct Method {
        url: String,
        headers: HashMap<String, String>,
    }

    let upload_method: Method = serde_json::from_value(upload_method.clone())?;
    let client = reqwest::Client::new();

    let mut req = client
        .put(&upload_method.url)
        .header("Content-Length", content_length);
    for (k, v) in upload_method.headers.iter() {
        req = req.header(k, v);
    }

    let stream = FramedRead::new(reader, BytesCodec::new());
    req = req.body(Body::wrap_stream(stream));

    req.send().await?;

    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use anyhow::Error;
    use async_trait::async_trait;
    use httptest::{
        matchers::{all_of, contains, request, ExecutionContext, Matcher},
        responders::status_code,
        Expectation,
    };
    use ring::rand::{SecureRandom, SystemRandom};
    use serde_json::json;
    use std::fmt;
    use std::sync::Mutex;
    use taskcluster::chrono::Duration;

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

    /// Fake implementation of the Object service, that only supports DataInline
    #[derive(Default)]
    struct DataInlineOnly {
        logger: Logger,
    }

    #[async_trait]
    impl ObjectService for DataInlineOnly {
        async fn createUpload(
            &self,
            name: &str,
            payload: &Value,
        ) -> std::result::Result<Value, Error> {
            let expires: DateTime<Utc> =
                serde_json::from_value(payload["expires"].clone()).unwrap();
            self.logger.log(format!(
                "create {} {} {} {}",
                name,
                expires,
                payload["projectId"].as_str().unwrap(),
                payload["uploadId"].as_str().unwrap()
            ));
            if let Some(di) = payload.pointer("/proposedUploadMethods/dataInline") {
                self.logger.log(format!(
                    "dataInline {} {}",
                    di["contentType"].as_str().unwrap(),
                    di["objectData"].as_str().unwrap()
                ));
                Ok(json!({
                    "expires": payload["expires"],
                    "projectId": payload["projectId"],
                    "uploadId": payload["uploadId"],
                    "uploadMethod": {
                        "dataInline": true,
                    },
                }))
            } else {
                Ok(json!({
                    "expires": payload["expires"],
                    "projectId": payload["projectId"],
                    "uploadId": payload["uploadId"],
                    "uploadMethod": {},
                }))
            }
        }

        async fn finishUpload(
            &self,
            name: &str,
            payload: &Value,
        ) -> std::result::Result<(), Error> {
            assert_eq!(name, "some/object");
            self.logger.log(format!(
                "finish {} {} {}",
                name,
                payload["projectId"].as_str().unwrap(),
                payload["uploadId"].as_str().unwrap(),
            ));
            Ok(())
        }
    }

    /// Fake implementation of the Object service, that only supports PutUrl
    struct PutUrlOnly {
        logger: Logger,
        server: httptest::Server,
    }

    impl PutUrlOnly {
        fn new(server: httptest::Server) -> Self {
            Self {
                logger: Logger::default(),
                server,
            }
        }
    }

    #[async_trait]
    impl ObjectService for PutUrlOnly {
        async fn createUpload(
            &self,
            name: &str,
            payload: &Value,
        ) -> std::result::Result<Value, Error> {
            let expires: DateTime<Utc> =
                serde_json::from_value(payload["expires"].clone()).unwrap();
            self.logger.log(format!(
                "create {} {} {} {}",
                name,
                expires,
                payload["projectId"].as_str().unwrap(),
                payload["uploadId"].as_str().unwrap()
            ));
            if let Some(pu) = payload.pointer("/proposedUploadMethods/putUrl") {
                self.logger.log(format!(
                    "putUrl {} {}",
                    pu["contentType"].as_str().unwrap(),
                    pu["contentLength"]
                ));
                Ok(json!({
                    "expires": payload["expires"],
                    "projectId": payload["projectId"],
                    "uploadId": payload["uploadId"],
                    "uploadMethod": {
                        "putUrl": {
                            "expires": payload["expires"],
                            "url": self.server.url_str("/data"),
                            "headers": {
                                "Content-Type": pu["contentType"],
                                "Content-Length": pu["contentLength"].to_string(),
                                "X-Test-Header": "good",
                            },
                        },
                    },
                }))
            } else {
                Ok(json!({
                    "expires": payload["expires"],
                    "projectId": payload["projectId"],
                    "uploadId": payload["uploadId"],
                    "uploadMethod": {},
                }))
            }
        }

        async fn finishUpload(
            &self,
            name: &str,
            payload: &Value,
        ) -> std::result::Result<(), Error> {
            assert_eq!(name, "some/object");
            self.logger.log(format!(
                "finish {} {} {}",
                name,
                payload["projectId"].as_str().unwrap(),
                payload["uploadId"].as_str().unwrap(),
            ));
            Ok(())
        }
    }

    async fn upload<O: ObjectService>(
        object_service: &O,
        upload_id: String,
        expires: &DateTime<Utc>,
        data: &[u8],
    ) -> Result<()> {
        upload_impl(
            "proj",
            "some/object",
            "application/binary",
            data.len() as u64,
            expires,
            CursorReaderFactory::new(data),
            &Retry::default(),
            object_service,
            &upload_id,
        )
        .await
    }

    #[tokio::test]
    async fn small_data_inline_upload() -> Result<()> {
        let upload_id = slugid::v4();
        let expires = Utc::now() + Duration::hours(1);

        let object_service = DataInlineOnly {
            ..Default::default()
        };

        upload(&object_service, upload_id.clone(), &expires, b"hello world").await?;

        object_service.logger.assert(vec![
            format!("create some/object {} proj {}", expires, upload_id),
            format!(
                "dataInline application/binary {}",
                base64::encode(b"hello world")
            ),
            format!("finish some/object proj {}", upload_id),
        ]);

        Ok(())
    }

    #[tokio::test]
    async fn large_data_inline_upload() -> Result<()> {
        let upload_id = slugid::v4();
        let expires = Utc::now() + Duration::hours(1);

        let object_service = DataInlineOnly {
            ..Default::default()
        };

        let mut data = vec![0u8; 10000];
        SystemRandom::new().fill(&mut data).unwrap();
        let res = upload(&object_service, upload_id.clone(), &expires, &data).await;

        // negotiation fails..
        assert!(res.is_err());

        Ok(())
    }

    #[tokio::test]
    async fn put_url() -> Result<()> {
        let upload_id = slugid::v4();
        let expires = Utc::now() + Duration::hours(1);

        let server = httptest::Server::run();
        server.expect(
            Expectation::matching(all_of![
                Dbg,
                request::method_path("PUT", "/data"),
                request::body("hello, world"),
                request::headers(all_of![
                    // reqwest normalizes header names to lower-case
                    contains(("content-type", "application/binary")),
                    contains(("content-length", "12")),
                    contains(("x-test-header", "good")),
                ]),
            ])
            .times(1)
            .respond_with(status_code(200)),
        );

        let object_service = PutUrlOnly::new(server);

        upload(
            &object_service,
            upload_id.clone(),
            &expires,
            b"hello, world",
        )
        .await?;

        object_service.logger.assert(vec![
            format!("create some/object {} proj {}", expires, upload_id),
            format!("putUrl application/binary {}", 12),
            format!("finish some/object proj {}", upload_id),
        ]);

        drop(object_service); // ..and with it, server, which refs data

        Ok(())
    }
}
