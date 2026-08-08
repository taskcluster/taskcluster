from unittest import mock

import aiohttp
import base
import pytest
import taskcluster_urls as liburls

import taskcluster.aio.auth as subject_async


class FakeResponse:
    def __init__(self, status, body=None):
        self.status = status
        self.body = body
        self.release = mock.AsyncMock()
        self.json = mock.AsyncMock(return_value=body)

    def raise_for_status(self):
        if self.status >= 400:
            raise aiohttp.ClientResponseError(
                mock.Mock(real_url=base.TEST_ROOT_URL),
                (),
                status=self.status,
            )


@pytest.fixture
def async_client():
    return subject_async.Auth(
        {
            "rootUrl": base.TEST_ROOT_URL,
            "credentials": {},
            "maxRetries": 2,
        }
    )


@pytest.fixture
def api_path():
    return liburls.api(base.TEST_ROOT_URL, "auth", "v1", "ping")


@pytest.fixture
def make_response():
    return FakeResponse
