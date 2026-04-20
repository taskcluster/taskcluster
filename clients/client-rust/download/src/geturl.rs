use anyhow::Error;
use futures_util::stream::StreamExt;
use reqwest::header;
use tokio::io::copy;
use tokio_util::io::StreamReader;

use crate::AsyncWriterFactory;

/// A result from a possibly-retriable operation.
pub(crate) enum RetriableResult<R, E> {
    /// Operation failed, but could be retried
    Retriable(E),
    /// Operation failed, and should not be retried
    Permanent(E),
    /// Operation succeeded
    Ok(R),
}

pub(crate) struct FetchMetadata {
    pub content_type: String,
}

/// Get a URL using `reqwest.get` and write it to an AsyncWriterFactory's factory.  The return
/// value indicates whether the operation can be retried.  Returns metadata about the fetched data.
pub(crate) async fn get_url<AWF: AsyncWriterFactory>(
    url: &str,
    writer_factory: &mut AWF,
) -> RetriableResult<FetchMetadata, Error> {
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

    let mut writer = match writer_factory.get_writer(res.content_length()).await {
        Ok(w) => w,
        Err(e) => return RetriableResult::Permanent(e),
    };

    // determine the content type and length before moving `res`
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

    match copy(&mut reader, &mut writer).await {
        Ok(_) => {}
        // an error copying data from the remote is common and retriable
        Err(e) => return RetriableResult::Retriable(e.into()),
    };

    return RetriableResult::Ok(FetchMetadata { content_type });
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::test_helpers::FakeDataServer;
    use async_trait::async_trait;
    use tokio::io::AsyncWrite;

    #[derive(Default)]
    struct SpyWriterFactory {
        content_lengths: Vec<Option<u64>>,
        buf: Vec<u8>,
    }

    #[async_trait]
    impl AsyncWriterFactory for SpyWriterFactory {
        async fn get_writer<'a>(
            &'a mut self,
            content_length: Option<u64>,
        ) -> anyhow::Result<Box<dyn AsyncWrite + Unpin + 'a>> {
            self.content_lengths.push(content_length);
            self.buf.clear();
            Ok(Box::new(&mut self.buf))
        }
    }

    #[tokio::test]
    async fn get_writer_receives_content_length_on_success() {
        let server = FakeDataServer::new(false, &[200]);
        let mut factory = SpyWriterFactory::default();

        match get_url(&server.data_url(), &mut factory).await {
            RetriableResult::Ok(_) => {}
            _ => panic!("expected a successful fetch"),
        }

        assert_eq!(factory.content_lengths, vec![Some(12)]);
        assert_eq!(&factory.buf, b"hello, world");
    }

    #[tokio::test]
    async fn get_writer_not_called_on_client_error() {
        let server = FakeDataServer::new(false, &[400]);
        let mut factory = SpyWriterFactory::default();

        match get_url(&server.data_url(), &mut factory).await {
            RetriableResult::Permanent(_) => {}
            _ => panic!("expected a permanent failure"),
        }

        assert!(factory.content_lengths.is_empty());
    }
}
