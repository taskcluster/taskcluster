use anyhow::Result;
use async_trait::async_trait;
use std::io::{Cursor, SeekFrom};
use tokio::fs::File;
use tokio::io::{AsyncRead, AsyncSeekExt};

/// An AsyncReaderFactory can produce, on demand, an AsyncReader.  In the event of an upload
/// failure, the restarted upload will use a fresh reader to start reading object content
/// at the beginning.
#[async_trait]
pub trait AsyncReaderFactory {
    async fn get_reader(&mut self) -> Result<Box<dyn AsyncRead + Sync + Send + Unpin + 'static>>;
}

/// A CusorReaderFactory creates AsyncReaders from a `std::io::Cursor`, allowing uploads from
/// in-memory buffers.  Note that this struct clones the given data for each retry, although this
/// behavior may be optimized in the future.
pub struct CursorReaderFactory(Vec<u8>);

#[async_trait]
impl AsyncReaderFactory for CursorReaderFactory {
    async fn get_reader(&mut self) -> Result<Box<dyn AsyncRead + Sync + Send + Unpin + 'static>> {
        Ok(Box::new(Cursor::new(self.0.clone())))
    }
}

impl CursorReaderFactory {
    pub fn new(buf: &[u8]) -> Self {
        Self(buf.to_vec())
    }
}

/// A FileReaderFactory creates AsyncReaders by rewinding and cloning a file.  The given
/// file must be clonable (that is, `try_clone()` must succeed).
pub struct FileReaderFactory(File);

#[async_trait]
impl AsyncReaderFactory for FileReaderFactory {
    async fn get_reader<'a>(
        &'a mut self,
    ) -> Result<Box<dyn AsyncRead + Sync + Send + Unpin + 'static>> {
        let mut file = self.0.try_clone().await?;
        file.seek(SeekFrom::Start(0)).await?;
        Ok(Box::new(file))
    }
}

impl FileReaderFactory {
    pub fn new(file: File) -> Self {
        Self(file)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use anyhow::Result;
    use tempfile::tempfile;
    use tokio::io::{copy, AsyncWriteExt};

    const DATA: &[u8] = b"HELLO/WORLD";

    async fn copy_from_factory<F: AsyncReaderFactory>(factory: &mut F) -> std::io::Result<Vec<u8>> {
        let mut reader = factory.get_reader().await.unwrap();
        let mut writer = Cursor::new(Vec::new());
        copy(&mut reader, &mut writer).await?;
        Ok(writer.into_inner())
    }

    #[tokio::test]
    async fn cursor_reader_twice() -> Result<()> {
        let mut factory = CursorReaderFactory::new(DATA);
        assert_eq!(&copy_from_factory(&mut factory).await?, DATA);
        assert_eq!(&copy_from_factory(&mut factory).await?, DATA);
        Ok(())
    }

    #[tokio::test]
    async fn file_reader_twice() -> Result<()> {
        let mut file: File = tempfile()?.into();
        file.write_all(DATA).await?;

        let mut factory = FileReaderFactory::new(file);
        assert_eq!(&copy_from_factory(&mut factory).await?, DATA);
        assert_eq!(&copy_from_factory(&mut factory).await?, DATA);
        Ok(())
    }
}
