"""
Tests of uploads and downloads using local fakes and requiring no credentials.
"""
import io

import pytest
import hashlib
import httptest
import aiohttp

import taskcluster
from taskcluster import upload, download


class FakeQueue:
    def __init__(self, storageType, ts):
        self.storageType = storageType
        self.ts = ts
        self.options = {"rootUrl": "https://tc-testing.example.com"}

    def latestArtifact(self, taskId, name):
        return self.artifact(taskId, 1, name)

    def artifact(self, taskId, runId, name):
        assert taskId == 'task-id'
        assert runId == 1
        assert name == 'public/test.data'

        if self.storageType == 's3' or self.storageType == 'reference':
            return {
                "storageType": self.storageType,
                "url": f"{self.ts.url()}data",
            }

        elif self.storageType == 'object':
            return {
                "storageType": self.storageType,
                "name": "some/object",
                "credentials": {"clientId": "c", "accessToken": "a"},
            }

        elif self.storageType == 'error':
            return {
                "storageType": self.storageType,
                "message": "uhoh",
                "reason": "testing",
            }


class FakeObject:
    def __init__(self, ts, *, hashes={}):
        self.ts = ts
        self.hashes = hashes

    def startDownload(self, name, payload):
        assert payload["acceptDownloadMethods"]["getUrl"]
        return {
            "method": "getUrl",
            "url": f"{self.ts.url()}data",
            "expires": str(taskcluster.fromNow('1 hour')),
            "hashes": self.hashes,
        }

    def createUpload(self, name, payload):
        self.lastUploadId = payload["uploadId"]
        self.lastProjectId = payload["projectId"]

        putUrl = payload["proposedUploadMethods"]["putUrl"]
        assert putUrl["contentType"] == "text/plain"
        return {
            "expires": payload["expires"],
            "projectId": payload["projectId"],
            "uploadId": payload["uploadId"],
            "uploadMethod": {
                "putUrl": {
                    "expires": payload["expires"],
                    "headers": {
                        "content-type": putUrl["contentType"],
                        "content-length": str(putUrl["contentLength"]),
                    },
                    "url": f"{self.ts.url()}data",
                },
            },
        }

    def finishUpload(self, name, payload):
        assert payload["uploadId"] == self.lastUploadId
        assert payload["projectId"] == self.lastProjectId

        return {}


def test_getUrl_download_fails():
    "When a getUrl download's GET fails with a 400, an exception is raised and no retries occur"
    getcount = 0

    class Server(httptest.Handler):
        def do_GET(self):
            nonlocal getcount
            getcount += 1
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            download.downloadToBuf(
                name="some/object",
                objectService=objectService)
        assert getcount == 1


def test_getUrl_download_fails_retried():
    "When a getUrl download's GET fails with a 500, an exception is raised after five retries"
    attempts = 0

    class Server(httptest.Handler):
        def do_GET(self):
            nonlocal attempts
            attempts += 1
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            download.downloadToBuf(
                name="some/object",
                objectService=objectService)

    assert attempts == 6  # one try plus five retries


def test_getUrl_download_fails_retried_succeeds(randbytes):
    "When a getUrl download's GET fails with a 500, it is retried successfully"
    attempts = 0
    data = randbytes(1024)

    class Server(httptest.Handler):
        def do_GET(self):
            nonlocal attempts
            attempts += 1
            if attempts > 2:
                self.send_response(200)
                self.send_header('content-type', 'text/plain')
                self.send_header('content-length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts, hashes={
            "sha256": hashlib.sha256(data).hexdigest(),
            "sha512": hashlib.sha512(data).hexdigest(),
        })
        buf, content_type = download.downloadToBuf(
            name="some/object",
            objectService=objectService)

    assert attempts == 3
    assert buf == data
    assert content_type == 'text/plain'


def test_download(randbytes):
    """Test that download works with a custom sync writer factory."""
    data = randbytes(1024)

    class Server(httptest.Handler):
        def do_GET(self):
            self.send_response(200)
            self.end_headers()
            self.wfile.write(data)

    writer = None

    def writerFactory():
        nonlocal writer
        writer = io.BytesIO()
        return writer

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts, hashes={
            "sha256": hashlib.sha256(data).hexdigest(),
            "sha512": hashlib.sha512(data).hexdigest(),
        })
        download.download(
            name="some/object",
            writerFactory=writerFactory,
            objectService=objectService)

    assert bytes(writer.getbuffer()) == data


def test_putUrl_upload_fails(randbytes):
    "When a putUrl upload's PUT fails with a 400, an exception is raised"
    data = randbytes(10240)  # >8k to avoid using dataInline
    attempts = 0

    class Server(httptest.Handler):
        def do_PUT(self):
            nonlocal attempts
            attempts += 1
            self.rfile.read(len(data))
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            upload.uploadFromBuf(
                projectId="taskcluster",
                expires=taskcluster.fromNow('1 hour'),
                contentType="text/plain",
                contentLength=len(data),
                name="some/object",
                data=data,
                objectService=objectService)

    assert attempts == 1


def test_putUrl_upload_fails_retried(randbytes):
    "When a putUrl upload's PUT fails with a 500, an exception is raised"
    data = randbytes(10240)  # >8k to avoid using dataInline
    attempts = 0

    class Server(httptest.Handler):
        def do_PUT(self):
            nonlocal attempts
            attempts += 1
            self.rfile.read(len(data))
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            upload.uploadFromBuf(
                projectId="taskcluster",
                expires=taskcluster.fromNow('1 hour'),
                contentType="text/plain",
                contentLength=len(data),
                name="some/object",
                data=data,
                objectService=objectService)

    assert attempts == 6  # one try plus five retries


def test_putUrl_upload_fails_retried_succeeds(randbytes):
    "When a putUrl upload's PUT fails with a 500, an exception is raised"
    data = randbytes(10240)  # >8k to avoid using dataInline
    attempts = 0

    class Server(httptest.Handler):
        def do_PUT(self):
            nonlocal attempts
            attempts += 1
            self.rfile.read(len(data))
            if attempts > 2:
                self.send_response(200)
                self.send_header('content-length', "0")
                self.end_headers()
            else:
                self.send_response(500)
                self.send_header('content-length', "4")
                self.end_headers()
                self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        upload.uploadFromBuf(
            projectId="taskcluster",
            expires=taskcluster.fromNow('1 hour'),
            contentType="text/plain",
            contentLength=len(data),
            name="some/object",
            data=data,
            objectService=objectService)

    assert attempts == 3


def test_putUrl_upload(randbytes):
    """Test that upload works with a custom sync reader factory."""
    data = randbytes(10240)  # >8k to avoid using dataInline

    uploaded_data = b''

    class Server(httptest.Handler):
        def do_PUT(self):
            nonlocal uploaded_data
            uploaded_data = self.rfile.read(len(data))
            self.send_response(200)
            self.end_headers()

    def readerFactory():
        return io.BytesIO(data)

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        upload.upload(
            projectId="taskcluster",
            expires=taskcluster.fromNow('1 hour'),
            contentType="text/plain",
            contentLength=len(data),
            name="some/object",
            readerFactory=readerFactory,
            objectService=objectService)

    assert uploaded_data == data


def test_download_object_artifact(randbytes, monkeypatch):
    "Download an object artifact"
    # note: other artifact types are tested in tests/aio; this just
    # validates the sync wrappers
    data = randbytes(1024)

    class Server(httptest.Handler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('content-type', 'text/plain')
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    with httptest.Server(Server) as ts:
        # the wrapped async download will create an _async_ Object client,
        # so we use the fake from the async tests
        def make_fake_async_object(options):
            from aio.test_upload_download import FakeObject
            assert options["credentials"] == {"clientId": "c", "accessToken": "a"}
            assert options["rootUrl"] == "https://tc-testing.example.com"
            return FakeObject(ts, hashes={
                "sha256": hashlib.sha256(data).hexdigest(),
                "sha512": hashlib.sha512(data).hexdigest(),
            })

        monkeypatch.setattr(taskcluster.aio.download, "Object", make_fake_async_object)

        queueService = FakeQueue("object", ts)
        buf, content_type = download.downloadArtifactToBuf(
            taskId='task-id',
            runId=1,
            name="public/test.data",
            queueService=queueService)

    assert buf == data
    assert content_type == 'text/plain'
