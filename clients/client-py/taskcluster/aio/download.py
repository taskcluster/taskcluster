"""
Support for downloading objects from the object service, following best
practices for that service.

Downloaded data is written to a "writer" provided by a "writer factory".  A
writer has an async `write` method which writes the entire passed buffer to
storage.  A writer factory is an async callable which returns a fresh writer,
ready to write the first byte of the object.  When downloads are retried, the
writer factory may be called more than once.

Note that `aiofile.open` returns a value suitable for use as a writer, if async
file IO is important to the application.

This module provides several pre-defined writers and writer factories for
common cases.
"""
import six

if six.PY2:
    raise ImportError("download is only supported in Python 3")

import aiohttp

from .asyncutils import ensureCoro
from .reader_writer import streamingCopy, BufferWriter, FileWriter
from .retry import retry


async def downloadToBuf(**kwargs):
    """
    Convenience method to download data to an in-memory buffer and return the
    downloaded data.  Arguments are the same as `download`, except that
    `writerFactory` should not be supplied.  Returns a tuple (buffer, contentType).
    """
    writer = None

    async def writerFactory():
        nonlocal writer
        writer = BufferWriter()
        return writer

    contentType = await download(writerFactory=writerFactory, **kwargs)
    return writer.getbuffer(), contentType


async def downloadToFile(file, **kwargs):
    """
    Convenience method to download data to a file object.  The file must be
    writeable, in binary mode, seekable (`f.seek`), and truncatable
    (`f.truncate`) to support retries.  Arguments are the same as `download`,
    except that `writerFactory` should not be supplied.  Returns the content-type.
    """
    async def writerFactory():
        file.seek(0)
        file.truncate()
        return FileWriter(file)

    return await download(writerFactory=writerFactory, **kwargs)


async def download(*, name, maxRetries=5, objectService, writerFactory):
    """
    Download the named object from the object service, using a writer returned
    from `writerFactory` to write the data.  The `maxRetries` parameter has
    the same meaning as for service clients.  The `objectService` parameter is
    an instance of the Object class, configured with credentials for the
    upload.  Returns the content-type.
    """
    async with aiohttp.ClientSession() as session:
        downloadResp = await ensureCoro(objectService.startDownload)(name, {
            "acceptDownloadMethods": {
                "simple": True,
            },
        })

        method = downloadResp["method"]

        async def tryDownload(retryFor):
            try:
                if method == "simple":
                    writer = await writerFactory()
                    return await _doSimpleDownload(downloadResp, writer, session)
                else:
                    raise RuntimeError(f'Unknown download method {method}')
            except aiohttp.ClientResponseError as exc:
                # treat 4xx's as fatal, and retry others
                if 400 <= exc.status < 500:
                    raise exc
                return retryFor(exc)
            except aiohttp.ClientError as exc:
                # retry for all other aiohttp errors
                return retryFor(exc)
            # .. anything else is considered fatal

        return await retry(maxRetries, tryDownload)


async def _doSimpleDownload(downloadResp, writer, session):
    url = downloadResp['url']
    async with session.get(url) as resp:
        contentType = resp.content_type
        resp.raise_for_status()
        # note that `resp.content` is a StreamReader and satisfies the
        # requirements of a reader in this case
        await streamingCopy(resp.content, writer)

    return contentType
