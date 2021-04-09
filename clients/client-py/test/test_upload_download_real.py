"""
Tests of uploads and downloads against the real Object service as given by
TASKCLUSTER_* variables
"""

import os
import secrets

import pytest

import taskcluster
from taskcluster import Object, upload, download
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


def test_small_upload_download(objectService):
    """We can upload a small amount of literal data"""
    data = b"hello, world"
    do_over_wire_buf_test(data, objectService)


def test_large_upload_download(objectService):
    """We can upload a larger amount of literal data (>8k to avoid using dataInline)"""
    data = secrets.token_bytes(102400)
    do_over_wire_buf_test(data, objectService)


def do_over_wire_buf_test(data, objectService):
    """We can upload a small amount of literal data"""
    name = f"taskcluster/test/client-py/{taskcluster.slugid.v4()}"
    upload.uploadFromBuf(
        projectId="taskcluster",
        name=name,
        contentType="text/plain",
        contentLength=len(data),
        expires=taskcluster.fromNow('1 hour'),
        data=data,
        objectService=objectService)

    got, contentType = download.downloadToBuf(
        name=name,
        objectService=objectService)

    assert got == data
    assert contentType == 'text/plain'


def test_file_upload_download(objectService, tmp_path):
    src = tmp_path / "src"
    dest = tmp_path / "dest"

    data = secrets.token_bytes(102400)
    with open(src, "wb") as f:
        f.write(data)

    name = f"taskcluster/test/client-py/{taskcluster.slugid.v4()}"
    with open(src, "rb") as file:
        upload.uploadFromFile(
            projectId="taskcluster",
            name=name,
            contentType="text/plain",
            contentLength=len(data),
            expires=taskcluster.fromNow('1 hour'),
            file=file,
            objectService=objectService)

    with open(dest, "wb") as file:
        contentType = download.downloadToFile(
            name=name,
            file=file,
            objectService=objectService)

    with open(dest, "rb") as f:
        got = f.read()

    assert got == data
    assert contentType == 'text/plain'
