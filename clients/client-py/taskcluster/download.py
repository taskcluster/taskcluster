"""
Support for downloading objects from the object service, following best
practices for that service.

Downloaded data is written to a "writer" provided by a "writer factory".  A
writer has a `write` method which writes the entire passed buffer to storage.
A writer factory is a callable which returns a fresh writer, ready to write the
first byte of the object.  When downloads are retried, the writer factory may
be called more than once.

This module provides several pre-defined writers and writer factories for
common cases.
"""
import six

if six.PY2:
    raise ImportError("download is only supported in Python 3")

import io

import requests

from .retry import retry


def downloadToBuf(**kwargs):
    """
    Convenience method to download data to an in-memory buffer and return the
    downloaded data.  Arguments are the same as `download`, except that
    `writerFactory` should not be supplied.  Returns a tuple (buffer, contentType).
    """
    writer = None

    def writerFactory():
        nonlocal writer
        writer = io.BytesIO()
        return writer

    contentType = download(writerFactory=writerFactory, **kwargs)
    return writer.getbuffer(), contentType


def downloadToFile(file, **kwargs):
    """
    Convenience method to download data to a file object.  The file must be
    writeable, in binary mode, seekable (`f.seek`), and truncatable
    (`f.truncate`) to support retries.  Arguments are the same as `download`,
    except that `writerFactory` should not be supplied.  Returns the content-type.
    """
    def writerFactory():
        file.seek(0)
        file.truncate()
        return file

    return download(writerFactory=writerFactory, **kwargs)


def download(*, name, maxRetries=5, objectService, writerFactory):
    """
    Download the named object from the object service, using a writer returned
    from `writerFactory` to write the data.  The `maxRetries` parameter has
    the same meaning as for service clients.  The `objectService` parameter is
    an instance of the Object class, configured with credentials for the
    upload.  Returns the content-type.
    """
    with requests.Session() as session:
        downloadResp = objectService.startDownload(name, {
            "acceptDownloadMethods": {
                "simple": True,
            },
        })

        method = downloadResp["method"]

        def tryDownload(retryFor):
            try:
                if method == "simple":
                    writer = writerFactory()
                    return _doSimpleDownload(downloadResp, writer, session)
                else:
                    raise RuntimeError(f'Unknown download method {method}')
            except requests.HTTPError as exc:
                # treat 4xx's as fatal, and retry others
                if hasattr(exc, 'response') and 400 <= exc.response.status_code < 500:
                    print("no retry")
                    raise exc
                return retryFor(exc)
            except requests.RequestException as exc:
                # retry for all other requests errors
                return retryFor(exc)
            # .. anything else is considered fatal

        return retry(maxRetries, tryDownload)


def _streamResponseToWriter(response, writer):
    "Copy data from a requests Response to a writer"
    chunk_size = 64 * 1024

    for chunk in response.iter_content(chunk_size):
        writer.write(chunk)


def _doSimpleDownload(downloadResp, writer, session):
    url = downloadResp['url']
    with session.get(url, stream=True) as resp:
        contentType = resp.headers.get('content-type', 'application/octet-stream')
        resp.raise_for_status()
        _streamResponseToWriter(resp, writer)

    return contentType
