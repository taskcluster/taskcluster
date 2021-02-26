use anyhow::Result;
use async_trait::async_trait;
use std::io::{Cursor, SeekFrom};
use tokio::fs::File;
use tokio::io::{AsyncSeekExt, AsyncWrite, AsyncWriteExt};

/// An AsyncWriterFactory can produce, on demand, an [AsyncWrite] object.  In the event of a
/// download failure, the restarted download will use a fresh writer to restart writing at the
/// beginning.
#[async_trait]
pub trait AsyncWriterFactory {
    /// Get a fresh [AsyncWrite] object, positioned at the point where downloaded data should
    /// be written.
    async fn get_writer<'a>(&'a mut self) -> Result<Box<dyn AsyncWrite + Unpin + 'a>>;
}

/// A CusorWriterFactory creates [AsyncWrite] objects from a [std::io::Cursor], allowing
/// downloads to in-memory buffers.  It is specialized for [Vec<u8>] (which grows indefinitely)
/// and `&mut [u8]` (which has a fixed maximum size)
pub struct CursorWriterFactory<T>(Cursor<T>);

#[async_trait]
impl AsyncWriterFactory for CursorWriterFactory<Vec<u8>> {
    async fn get_writer<'a>(&'a mut self) -> Result<Box<dyn AsyncWrite + Unpin + 'a>> {
        self.0.get_mut().clear();
        self.0.set_position(0);
        Ok(Box::new(&mut self.0))
    }
}

#[async_trait]
impl AsyncWriterFactory for CursorWriterFactory<&mut [u8]> {
    async fn get_writer<'a>(&'a mut self) -> Result<Box<dyn AsyncWrite + Unpin + 'a>> {
        self.0.set_position(0);
        Ok(Box::new(&mut self.0))
    }
}

impl Default for CursorWriterFactory<Vec<u8>> {
    fn default() -> Self {
        Self(Cursor::new(Vec::new()))
    }
}

impl CursorWriterFactory<Vec<u8>> {
    pub fn new() -> Self {
        Self::default()
    }

    /// Consume the factory, returning the vector into which the data was read
    pub fn into_inner(self) -> Vec<u8> {
        self.0.into_inner()
    }
}

impl<'a> CursorWriterFactory<&'a mut [u8]> {
    pub fn for_buf(inner: &'a mut [u8]) -> Self {
        Self(Cursor::new(inner))
    }

    /// Return the size of the data written to the buffer.  This value should
    /// be used to slice the resulting data from the buffer.
    pub fn size(self) -> usize {
        self.0.position() as usize
    }
}

/// A FileWriterFactory creates [AsyncWrite] objects by rewinding and cloning a [tokio::fs::File].
/// The file must be open in write mode and must be clone-able (that is, [File::try_clone()] must
/// succeed) in order to support retried uploads.
pub struct FileWriterFactory(File);

#[async_trait]
impl AsyncWriterFactory for FileWriterFactory {
    async fn get_writer<'a>(&'a mut self) -> Result<Box<dyn AsyncWrite + Unpin + 'a>> {
        let mut file = self.0.try_clone().await?;
        file.set_len(0).await?;
        file.seek(SeekFrom::Start(0)).await?;
        Ok(Box::new(file))
    }
}

impl FileWriterFactory {
    pub fn new(file: File) -> Self {
        Self(file)
    }

    /// Return the File, after finishing any concurrent async operations.  The
    /// file posiion is unspecified.
    pub async fn into_inner(mut self) -> Result<File> {
        self.0.flush().await?;
        Ok(self.0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use anyhow::Result;
    use tempfile::tempfile;
    use tokio::io::{copy, AsyncReadExt, AsyncSeekExt};

    const DATA: &[u8] = b"HELLO/WORLD";

    async fn copy_to_factory<F: AsyncWriterFactory>(
        data: &[u8],
        factory: &mut F,
    ) -> std::io::Result<()> {
        let mut reader = Cursor::new(data);
        let mut writer = factory.get_writer().await.unwrap();
        copy(&mut reader, &mut writer).await?;
        Ok(())
    }

    #[tokio::test]
    async fn vec_cursor_writer_twice() -> Result<()> {
        let mut factory = CursorWriterFactory::new();
        copy_to_factory(b"wrong data, shouldn't see this", &mut factory).await?;
        copy_to_factory(DATA, &mut factory).await?;
        assert_eq!(&factory.into_inner(), DATA);
        Ok(())
    }

    #[tokio::test]
    async fn buf_cursor_writer_twice() -> Result<()> {
        let mut buf = [0u8; 256];
        let mut factory = CursorWriterFactory::for_buf(&mut buf[..]);
        copy_to_factory(b"nobody should see this", &mut factory).await?;
        copy_to_factory(DATA, &mut factory).await?;
        let size = factory.size();
        assert_eq!(&buf[..size], DATA);
        Ok(())
    }

    #[tokio::test]
    async fn buf_cursor_writer_too_small() -> Result<()> {
        let mut buf = [0u8; 5];
        let mut factory = CursorWriterFactory::for_buf(&mut buf[..]);
        let err = copy_to_factory(DATA, &mut factory).await.unwrap_err();
        assert_eq!(err.kind(), std::io::ErrorKind::WriteZero);
        Ok(())
    }

    #[tokio::test]
    async fn file_writer_twice() -> Result<()> {
        let mut factory = FileWriterFactory::new(tempfile()?.into());
        copy_to_factory(b"wrong data, shouldn't see this", &mut factory).await?;
        copy_to_factory(DATA, &mut factory).await?;

        let mut file = factory.into_inner().await?;
        file.seek(SeekFrom::Start(0)).await?;

        let mut res = Vec::new();
        file.read_to_end(&mut res).await?;
        assert_eq!(&res, DATA);
        Ok(())
    }
}
