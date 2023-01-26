"""
Tests of uploads and downloads using local fakes and requiring no credentials.
"""
import pytest
import httptest
import aiohttp
import hashlib

import taskcluster
from taskcluster import exceptions
from taskcluster.aio import upload, download
from taskcluster.aio.reader_writer import BufferReader


pytestmark = [
    pytest.mark.asyncio,
]


class FakeQueue:
    def __init__(self, storageType, ts):
        self.storageType = storageType
        self.ts = ts
        self.options = {"rootUrl": "https://tc-testing.example.com"}

    async def latestArtifact(self, taskId, name):
        return await self.artifact(taskId, 1, name)

    async def artifact(self, taskId, runId, name):
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
    def __init__(self, ts, *, immediateExpire=False, hashes={}):
        self.ts = ts
        self.immediateExpire = immediateExpire
        self.startCount = 0
        self.hashes = hashes

    async def startDownload(self, name, payload):
        assert name == "some/object"
        assert payload["acceptDownloadMethods"]["getUrl"]
        self.startCount += 1
        return {
            "method": "getUrl",
            "url": f"{self.ts.url()}data",
            "expires": str(taskcluster.fromNow('0s') if self.immediateExpire else taskcluster.fromNow('1 hour')),
            "hashes": self.hashes,
        }

    async def createUpload(self, name, payload):
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

    async def finishUpload(self, name, payload):
        assert payload["uploadId"] == self.lastUploadId
        assert payload["projectId"] == self.lastProjectId

        return {}


def makeDataServerHandler(data, responses=[200]):
    """Make a subclass of httptestHandler that will return the given responses,
    in order, returning `data` for 200's."""
    class DataServer(httptest.Handler):
        # getcount contains the number of GET requests
        getcount = 0

        def do_GET(self):
            DataServer.getcount += 1
            resp = responses.pop(0)
            print(("GET", resp))
            if resp == 200:
                self.send_response(200)
                self.send_header('content-type', 'text/plain')
                self.send_header('content-length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)
            else:
                self.send_response(resp)
                self.end_headers()
                self.wfile.write(b'uhoh')

    return DataServer


async def test_hashing_reader_hashes():
    hashingReader = upload.HashingReader(BufferReader(b"some data"))
    assert (await hashingReader.read(4) == b"some")
    assert (await hashingReader.read(1) == b" ")
    assert (await hashingReader.read(16) == b"data")
    assert (await hashingReader.read(16) == b"")

    exp = {}
    h = hashlib.sha256()
    h.update(b"some data")
    exp["sha256"] = h.hexdigest()
    h = hashlib.sha512()
    h.update(b"some data")
    exp["sha512"] = h.hexdigest()

    assert (hashingReader.hashes(9) == exp)

    with pytest.raises(RuntimeError):
        hashingReader.hashes(999)


async def test_getUrl_download_fails():
    "When a getUrl download's GET fails with a 400, an exception is raised and no retries occur"
    server = makeDataServerHandler(b'', [400])
    with httptest.Server(server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            await download.downloadToBuf(
                name="some/object",
                objectService=objectService)
        assert server.getcount == 1


async def test_getUrl_download_fails_retried():
    "When a getUrl download's GET fails with a 500, an exception is raised after five retries"
    server = makeDataServerHandler(b'', [500, 500, 500, 500, 500, 500])
    with httptest.Server(server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            await download.downloadToBuf(
                name="some/object",
                objectService=objectService)
    assert server.getcount == 6  # one try plus five retries


async def test_getUrl_download_fails_retried_succeeds(randbytes):
    "When a getUrl download's GET fails with a 500, it is retried successfully"
    data = randbytes(1024)
    server = makeDataServerHandler(data, [500, 500, 200])
    with httptest.Server(server) as ts:
        objectService = FakeObject(ts, hashes={
            "sha256": hashlib.sha256(data).hexdigest(),
            "sha512": hashlib.sha512(data).hexdigest(),
        })
        buf, content_type = await download.downloadToBuf(
            name="some/object",
            objectService=objectService)

    assert server.getcount == 3
    assert len(buf) == len(data)
    assert buf == data
    assert content_type == 'text/plain'


async def test_getUrl_download_fails_reinvokes_startDownload(randbytes):
    """When a getUrl download's GET fails with a 500, and the startDownload
    response has expired, it is retried successfully"""
    data = randbytes(1024)
    server = makeDataServerHandler(data, [500, 200])
    with httptest.Server(server) as ts:
        objectService = FakeObject(ts, immediateExpire=True, hashes={
            "sha256": hashlib.sha256(data).hexdigest(),
            "sha512": hashlib.sha512(data).hexdigest(),
        })
        buf, content_type = await download.downloadToBuf(
            name="some/object",
            objectService=objectService)

    assert objectService.startCount == 2
    assert server.getcount == 2
    assert buf == data
    assert content_type == 'text/plain'


async def test_putUrl_upload_fails(randbytes):
    "When a putUrl upload's PUT fails with a 400, an exception is raised"
    data = randbytes(10240)  # >8k to avoid using dataInline

    class Server(httptest.Handler):
        def do_PUT(self):
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        with pytest.raises(aiohttp.ClientResponseError):
            await upload.uploadFromBuf(
                projectId="taskcluster",
                expires=taskcluster.fromNow('1 hour'),
                contentType="text/plain",
                contentLength=len(data),
                name="some/object",
                data=data,
                objectService=objectService)


async def test_putUrl_upload_fails_retried(randbytes):
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
            await upload.uploadFromBuf(
                projectId="taskcluster",
                expires=taskcluster.fromNow('1 hour'),
                contentType="text/plain",
                contentLength=len(data),
                name="some/object",
                data=data,
                objectService=objectService)

    assert attempts == 6  # one try plus five retries


async def test_putUrl_upload_fails_retried_succeeds(randbytes):
    "When a putUrl upload's PUT fails with a 500, an exception is raised"
    data = randbytes(10240)  # >8k to avoid using dataInline
    attempts = 0

    class Server(httptest.Handler):
        def do_PUT(self):
            nonlocal attempts
            attempts += 1
            if attempts > 2:
                self.send_response(200)
                self.end_headers()
            else:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(b'uhoh')

    with httptest.Server(Server) as ts:
        objectService = FakeObject(ts)
        await upload.uploadFromBuf(
            projectId="taskcluster",
            expires=taskcluster.fromNow('1 hour'),
            contentType="text/plain",
            contentLength=len(data),
            name="some/object",
            data=data,
            objectService=objectService)

    assert attempts == 3


async def test_download_s3_artifact(randbytes):
    "Download an S3 artifact"
    data = randbytes(1024)

    class Server(httptest.Handler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('content-type', 'text/plain')
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    with httptest.Server(Server) as ts:
        queueService = FakeQueue("s3", ts)
        buf, content_type = await download.downloadArtifactToBuf(
            taskId='task-id',
            runId=1,
            name="public/test.data",
            queueService=queueService)

    assert buf == data
    assert content_type == 'text/plain'


async def test_download_object_artifact(randbytes, monkeypatch):
    "Download an object artifact"
    data = randbytes(1024)

    class Server(httptest.Handler):
        def do_GET(self):
            self.send_response(200)
            self.send_header('content-type', 'text/plain')
            self.send_header('content-length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    with httptest.Server(Server) as ts:
        def make_fake_object(options):
            assert options["credentials"] == {"clientId": "c", "accessToken": "a"}
            assert options["rootUrl"] == "https://tc-testing.example.com"
            return FakeObject(ts, hashes={
                "sha256": hashlib.sha256(data).hexdigest(),
                "sha512": hashlib.sha512(data).hexdigest(),
            })

        monkeypatch.setattr(taskcluster.aio.download, "Object", make_fake_object)

        queueService = FakeQueue("object", ts)
        buf, content_type = await download.downloadArtifactToBuf(
            taskId='task-id',
            runId=1,
            name="public/test.data",
            queueService=queueService)

    assert buf == data
    assert content_type == 'text/plain'


async def test_download_error_artifact(randbytes):
    "Download an error artifact"
    queueService = FakeQueue("error", None)
    with pytest.raises(exceptions.TaskclusterArtifactError) as excinfo:
        await download.downloadArtifactToBuf(
            taskId='task-id',
            name="public/test.data",
            queueService=queueService)

    assert str(excinfo.value) == "uhoh"
    assert excinfo.value.reason == "testing"


async def test_verifyHashes_no_acceptable():
    "verifyHashes fails when no acceptable hashes are present"
    with pytest.raises(exceptions.ObjectHashVerificationError):
        download.verifyHashes({"md5": "good", "sha512": "good"}, {"md5": "good"})


async def test_verifyHashes_no_overlap():
    "verifyHashes fails when none of the observed hashes are expected"
    with pytest.raises(exceptions.ObjectHashVerificationError):
        download.verifyHashes({"sha256": "good", "sha512": "good"}, {"sha102": "good"})


async def test_verifyHashes_one_mismatch():
    "verifyHashes fails when some hashes match but others do not"
    with pytest.raises(exceptions.ObjectHashVerificationError):
        download.verifyHashes({"sha256": "good", "sha512": "good"}, {"sha256": "good", "sha512": "bad"})


async def test_verifyHashes_one_match():
    "verifyHashes suceeds when one matching hash appears in both sets"
    download.verifyHashes({"sha256": "good", "sha512": "good"}, {"sha512": "good", "sha1024": "good"})


async def test_verifyHashes_all_match():
    "verifyHashes succeeds when all hashes match"
    download.verifyHashes({"sha256": "good", "sha512": "good"}, {"sha256": "good", "sha512": "good"})
