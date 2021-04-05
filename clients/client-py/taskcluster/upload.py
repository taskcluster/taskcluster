"""
Support for uploading objects to the object service, following best
practices for that service.

Data for upload is read from a "reader" provided by a "reader factory".  A
reader has a `read(max_size)` method which reads and returns a chunk of 1 ..
`max_size` bytes, or returns an empty string at EOF.  A reader factory is a
callable which returns a fresh reader, ready to read the first byte of the
object.  When uploads are retried, the reader factory may be called more than
once.

This module provides several pre-defined readers and reader factories for
common cases.
"""
import six

if six.PY2:
    raise ImportError("upload is only supported in Python 3")

import base64
from shutil import copyfileobj
import io
import hashlib

import requests

import taskcluster
from .retry import retry

DATA_INLINE_MAX_SIZE = 8192


def upload_from_buf(*, data, **kwargs):
    """
    Convenience method to upload data from an in-memory buffer.  Arguments are the same
    as `upload` except that `readerFactory` should not be supplied.
    """
    def readerFactory():
        return io.BytesIO(data)

    upload(**kwargs, readerFactory=readerFactory)


def upload_from_file(*, file, **kwargs):
    """
    Convenience method to upload data from a a file.  The file should be open
    for reading, in binary mode, and be seekable (`f.seek`).  Remaining
    arguments are the same as `upload` except that `readerFactory` should not
    be supplied.
    """
    def readerFactory():
        file.seek(0)
        return file

    upload(**kwargs, readerFactory=readerFactory)


def upload(*, projectId, name, contentType, contentLength, expires,
           readerFactory, maxRetries=5, objectService):
    """
    Upload the given data to the object service with the given metadata.
    The `maxRetries` parameter has the same meaning as for service clients.
    The `objectService` parameter is an instance of the Object class,
    configured with credentials for the upload.
    """
    # wrap the readerFactory with one that will also hash the data
    hashingReader = None

    def hashingReaderFactory():
        nonlocal hashingReader
        hashingReader = HashingReader(readerFactory())
        return hashingReader

    with requests.Session() as session:
        uploadId = taskcluster.slugid.v4()
        proposedUploadMethods = {}

        if contentLength < DATA_INLINE_MAX_SIZE:
            reader = hashingReaderFactory()
            writer = io.BytesIO()
            copyfileobj(reader, writer)
            encoded = base64.b64encode(writer.getbuffer())
            proposedUploadMethods['dataInline'] = {
                "contentType": contentType,
                "objectData": encoded,
            }

        proposedUploadMethods['putUrl'] = {
            "contentType": contentType,
            "contentLength": contentLength,
        }

        uploadResp = objectService.createUpload(name, {
            "expires": expires,
            "projectId": projectId,
            "uploadId": uploadId,
            "proposedUploadMethods": proposedUploadMethods,
        })

        def tryUpload(retryFor):
            try:
                uploadMethod = uploadResp["uploadMethod"]
                if 'dataInline' in uploadMethod:
                    # data is already uploaded -- nothing to do
                    pass
                elif 'putUrl' in uploadMethod:
                    reader = hashingReaderFactory()
                    _putUrlUpload(uploadMethod['putUrl'], reader, session)
                else:
                    raise RuntimeError("Could not negotiate an upload method")
            except requests.HTTPError as exc:
                # treat 4xx's as fatal, and retry others
                if hasattr(exc, 'response') and 400 <= exc.response.status_code < 500:
                    raise exc
                print("1", exc)
                return retryFor(exc)
            except requests.RequestException as exc:
                # retry for all other requests errors
                print("2", exc)
                return retryFor(exc)
            # .. anything else is considered fatal

        retry(maxRetries, tryUpload)

        # TODO: pass this value to finishUpload when the deployed instance supports it
        # https://github.com/taskcluster/taskcluster/issues/4714
        hashingReader.hashes(contentLength)

        objectService.finishUpload(name, {
            "projectId": projectId,
            "uploadId": uploadId,
        })


def _putUrlUpload(method, reader, session):
    resp = session.put(method['url'], headers=method['headers'], data=reader)
    resp.raise_for_status()


class HashingReader:
    """A Reader implementation that hashes contents as they are read."""

    def __init__(self, inner):
        self.inner = inner
        self.sha256 = hashlib.sha256()
        self.sha512 = hashlib.sha512()
        self.bytes = 0

    def read(self, max_size):
        chunk = self.inner.read(max_size)
        self.update(chunk)
        return chunk

    def update(self, chunk):
        self.sha256.update(chunk)
        self.sha512.update(chunk)
        self.bytes += len(chunk)

    def hashes(self, contentLength):
        """Return the hsahes in a format suitable for finishUpload, first checking that all the bytes
        in the content were hashed."""
        if contentLength != self.bytes:
            raise RuntimeError(f"hashed {self.bytes} bytes but content length is {contentLength}")
        return {
            "sha256": self.sha256.hexdigest(),
            "sha512": self.sha512.hexdigest(),
        }
