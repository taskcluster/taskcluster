"""
Tests of uploads and downloads against the real Object service as given by
TASKCLUSTER_* variables
"""

import os
import secrets

import pytest
from aiofiles import open as async_open

import taskcluster
from taskcluster.aio import Object, upload, download
import base


def shouldSkip():
    vars = ['TASKCLUSTER_' + x for x in ('ROOT_URL', 'CLIENT_ID', 'ACCESS_TOKEN')]
    if all(v in os.environ for v in vars):
        return False

    if 'NO_SKIP_TESTS' in os.environ:
        raise RuntimeError('NO_SKIP_TESTS is set but TASKCLUSTER_{ROOT_URL,CLIENT_ID,ACCESS_TOKEN} are not')

    return True


pytestmark = [
    pytest.mark.skipif(shouldSkip(), reason="Skipping tests that require real credentials"),
    pytest.mark.asyncio
]


@pytest.fixture
def objectService():
    """
    Return a client object built with TC credentials from the environment.  The client
    is configured with authorized_scopes containing the scopes required for these
    tests.  If creating a new client for these tests, consult the scopes in the
    function body.
    """
    return Object({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': os.environ['TASKCLUSTER_CLIENT_ID'],
            'accessToken': os.environ['TASKCLUSTER_ACCESS_TOKEN'],
        },
        'authorizedScopes': [
            "object:upload:taskcluster:taskcluster/test/client-py/*",
            "object:download:taskcluster/test/client-py/*",
        ],
    })


async def test_small_upload_download(objectService):
    """We can upload a small amount of literal data"""
    data = b"hello, world"
    await do_over_wire_buf_test(data, objectService)


async def test_large_upload_download(objectService):
    """We can upload a larger amount of literal data (>8k to avoid using dataInline)"""
    data = secrets.token_bytes(102400)
    await do_over_wire_buf_test(data, objectService)


async def do_over_wire_buf_test(data, objectService):
    """We can upload a small amount of literal data"""
    name = f"taskcluster/test/client-py/{taskcluster.slugid.v4()}"
    await upload.uploadFromBuf(
        projectId="taskcluster",
        name=name,
        contentType="text/plain",
        contentLength=len(data),
        expires=taskcluster.fromNow('1 hour'),
        data=data,
        objectService=objectService)

    got, contentType = await download.downloadToBuf(
        name=name,
        objectService=objectService)

    assert got == data
    assert contentType == 'text/plain'


async def test_file_upload_download(objectService, tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"

    data = secrets.token_bytes(102400)
    with open(src, "wb") as f:
        f.write(data)

    name = f"taskcluster/test/client-py/{taskcluster.slugid.v4()}"
    with open(src, "rb") as file:
        await upload.uploadFromFile(
            projectId="taskcluster",
            name=name,
            contentType="text/plain",
            contentLength=len(data),
            expires=taskcluster.fromNow('1 hour'),
            file=file,
            objectService=objectService)

    with open(dest, "wb") as file:
        contentType = await download.downloadToFile(
            name=name,
            file=file,
            objectService=objectService)

    with open(dest, "rb") as f:
        got = f.read()

    assert got == data
    assert contentType == 'text/plain'


async def test_aiofile_upload_download(objectService, tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"

    data = secrets.token_bytes(102400)
    with open(src, "wb") as f:
        f.write(data)

    name = f"taskcluster/test/client-py/{taskcluster.slugid.v4()}"
    async with async_open(src, "rb") as file:
        async def readerFactory():
            file.seek(0)
            return file

        await upload.upload(
            projectId="taskcluster",
            name=name,
            contentType="text/plain",
            contentLength=len(data),
            expires=taskcluster.fromNow('1 hour'),
            readerFactory=readerFactory,
            objectService=objectService)

    async with async_open(dest, "wb") as file:
        async def writerFactory():
            file.seek(0)
            file.truncate()
            return file

        contentType = await download.download(
            name=name,
            writerFactory=writerFactory,
            objectService=objectService)

    with open(dest, "rb") as f:
        got = f.read()

    assert got == data
    assert contentType == 'text/plain'
