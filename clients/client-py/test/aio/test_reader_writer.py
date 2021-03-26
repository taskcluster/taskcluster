import pytest

from taskcluster.aio.reader_writer import BufferReader, BufferWriter, FileReader, FileWriter, streamingCopy

pytestmark = pytest.mark.asyncio


class CrashReader:
    "A reader that crashes at the end of data"
    def __init__(self, data):
        self.data = data

    async def read(self, max_size):
        size = max_size if max_size > 0 else 1024
        data, self.data = self.data[:size], self.data[size:]
        if not data:
            raise RuntimeError('uhoh, reader crashed')
        return data


class CrashWriter:
    "A writer that crashes on its first write"
    async def write(self, data):
        raise RuntimeError('uhoh, reader crashed')


async def test_streaming_copy_buffers(randbytes):
    data = randbytes(102400)

    reader = BufferReader(data)
    writer = BufferWriter()

    await streamingCopy(reader, writer)
    assert writer.getbuffer() == data


async def test_streaming_copy_files(randbytes, tmp_path):
    data = randbytes(102400)

    src = tmp_path / "src"
    dest = tmp_path / "dest"

    with open(src, "wb") as f:
        f.write(data)

    with open(src, "rb") as s:
        with open(dest, "wb") as d:
            reader = FileReader(s)
            writer = FileWriter(d)
            await streamingCopy(reader, writer)

    with open(dest, "rb") as f:
        got = f.read()

    assert got == data


async def test_streaming_copy_reader_fails(randbytes):
    data = randbytes(10240)

    reader = CrashReader(data)
    writer = BufferWriter()

    with pytest.raises(RuntimeError):
        await streamingCopy(reader, writer)


async def test_streaming_copy_writer_fails(randbytes):
    data = randbytes(10240)

    reader = BufferReader(data)
    writer = CrashWriter()

    with pytest.raises(RuntimeError):
        await streamingCopy(reader, writer)
