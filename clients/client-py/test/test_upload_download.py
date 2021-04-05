"""
Tests of uploads and downloads using local fakes and requiring no credentials.
"""

import pytest
import httptest
import requests
import io
import hashlib

import taskcluster
from taskcluster import upload, download


class FakeObject:
    def __init__(self, ts):
        self.ts = ts

    def startDownload(self, name, payload):
        assert payload["acceptDownloadMethods"]["simple"]
        return {
            "method": "simple",
            "url": f"{self.ts.url()}data",
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


def test_hashing_reader_hashes():
    hashingReader = upload.HashingReader(io.BytesIO(b"some data"))
    assert(hashingReader.read(4) == b"some")
    assert(hashingReader.read(1) == b" ")
    assert(hashingReader.read(16) == b"data")
    assert(hashingReader.read(16) == b"")

    exp = {}
    h = hashlib.sha256()
    h.update(b"some data")
    exp["sha256"] = h.hexdigest()
    h = hashlib.sha512()
    h.update(b"some data")
    exp["sha512"] = h.hexdigest()

    assert(hashingReader.hashes(9) == exp)

    with pytest.raises(RuntimeError):
        hashingReader.hashes(999)


def test_simple_download_fails():
    "When a simple download's GET fails with a 400, an exception is raised and no retries occur"
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
        with pytest.raises(requests.RequestException):
            download.downloadToBuf(
                name="some/object",
                objectService=objectService)
        assert getcount == 1


def test_simple_download_fails_retried():
    "When a simple download's GET fails with a 500, an exception is raised after five retries"
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
        with pytest.raises(requests.RequestException):
            download.downloadToBuf(
                name="some/object",
                objectService=objectService)

    assert attempts == 6  # one try plus five retries


def test_simple_download_fails_retried_succeeds(randbytes):
    "When a simple download's GET fails with a 500, it is retried successfully"
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
        objectService = FakeObject(ts)
        buf, content_type = download.downloadToBuf(
            name="some/object",
            objectService=objectService)

    assert attempts == 3
    assert buf == data
    assert content_type == 'text/plain'


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
        with pytest.raises(requests.RequestException):
            upload.upload_from_buf(
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
        with pytest.raises(requests.RequestException):
            upload.upload_from_buf(
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
        upload.upload_from_buf(
            projectId="taskcluster",
            expires=taskcluster.fromNow('1 hour'),
            contentType="text/plain",
            contentLength=len(data),
            name="some/object",
            data=data,
            objectService=objectService)

    assert attempts == 3
