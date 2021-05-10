use crate::factory::AsyncWriterFactory;
use anyhow::Error;
use futures_util::stream::StreamExt;
use reqwest::header;
use tokio::io::copy;
use tokio_util::io::StreamReader;

/// A result from a possibly-retriable operation.
pub(crate) enum RetriableResult<R, E> {
    /// Operation failed, but could be retried
    Retriable(E),
    /// Operation failed, and should not be retried
    Permanent(E),
    /// Operation succeeded
    Ok(R),
}

/// Get a URL using `reqwest.get` and write it to an AsyncWriterFactory's factory.  The
/// return value indicates whether the operation can be retried.  Returns the content-type.
pub(crate) async fn get_url<AWF: AsyncWriterFactory>(
    url: &str,
    writer_factory: &mut AWF,
) -> RetriableResult<String, Error> {
    let res = match reqwest::get(url)
        .await
        .and_then(|res| res.error_for_status())
    {
        Err(err) => {
            // if this was a client error (e.g., 400), it is permanent
            if err.status().map(|s| s.is_client_error()).unwrap_or(false) {
                return RetriableResult::Permanent(err.into());
            } else {
                return RetriableResult::Retriable(err.into());
            }
        }

        Ok(res) => res,
    };

    // determine the content type before moving `res`
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

    let mut writer = match writer_factory.get_writer().await {
        Ok(w) => w,
        // getting a writer from the factory is not retriable
        Err(e) => return RetriableResult::Permanent(e),
    };

    match copy(&mut reader, &mut writer).await {
        Ok(_) => {}
        // an error copying data from the remote is common and retriable
        Err(e) => return RetriableResult::Retriable(e.into()),
    };

    return RetriableResult::Ok(content_type);
}
