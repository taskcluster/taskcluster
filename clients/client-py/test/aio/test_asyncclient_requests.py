"""Offline tests for AsyncBaseClient._makeHttpRequest.

These mirror the retry and error tests for the synchronous client in
test/test_client.py. The HTTP layer (asyncutils.makeSingleHttpRequest) is mocked, so
nothing here touches the network and the exponential backoff sleep is skipped.
"""

from unittest import mock

import aiohttp
import base
import pytest
import taskcluster_urls as liburls

import taskcluster.aio.auth as subject
import taskcluster.aio.retry as aioretry
import taskcluster.exceptions as exc
from taskcluster.aio import asyncutils
from taskcluster.utils import dumpJson


class FakeResponse:
    """Stands in for aiohttp.ClientResponse: only what _makeHttpRequest uses."""

    def __init__(self, status, body=None, jsonError=None):
        self.status = status
        self.body = body
        self.jsonError = jsonError
        self.released = False

    def raise_for_status(self):
        if self.status >= 400:
            raise aiohttp.ClientResponseError(
                request_info=mock.Mock(real_url="https://tc-tests.example.com/"),
                history=(),
                status=self.status,
            )

    async def json(self):
        if self.jsonError:
            raise self.jsonError
        return self.body

    async def release(self):
        self.released = True


@pytest.fixture(autouse=True)
def noBackoff():
    """Skip the exponential backoff between retries."""
    with mock.patch.object(aioretry.asyncio, "sleep", new=mock.AsyncMock()) as sleep:
        yield sleep


@pytest.fixture
def client():
    return subject.Auth({"rootUrl": base.TEST_ROOT_URL})


@pytest.fixture
def credentialedClient():
    return subject.Auth(
        {
            "rootUrl": base.TEST_ROOT_URL,
            "credentials": {"clientId": "tester", "accessToken": "no-secret"},
        }
    )


@pytest.fixture
def apiPath():
    return liburls.api(base.TEST_ROOT_URL, "auth", "v1", "test")


@pytest.fixture
def send():
    with mock.patch.object(
        asyncutils, "makeSingleHttpRequest", new_callable=mock.AsyncMock
    ) as send:
        yield send


@pytest.mark.asyncio
async def test_success_first_try(client, send, apiPath):
    expected = {"test": "works"}
    send.return_value = FakeResponse(200, expected)

    assert await client._makeHttpRequest("GET", "test", None) == expected
    send.assert_awaited_once_with("GET", apiPath, None, mock.ANY, session=None)


@pytest.mark.asyncio
async def test_success_first_try_payload(client, send, apiPath):
    expected = {"test": "works"}
    send.return_value = FakeResponse(200, expected)

    assert await client._makeHttpRequest("GET", "test", {"payload": 2}) == expected
    send.assert_awaited_once_with(
        "GET", apiPath, dumpJson({"payload": 2}), mock.ANY, session=None
    )
    headers = send.await_args.args[3]
    assert headers["Content-Type"] == "application/json"


@pytest.mark.asyncio
async def test_no_content_type_header_without_payload(client, send):
    send.return_value = FakeResponse(200, {})

    await client._makeHttpRequest("GET", "test", None)
    assert "Content-Type" not in send.await_args.args[3]


@pytest.mark.asyncio
async def test_204_returns_none(client, send):
    send.return_value = FakeResponse(204)

    assert await client._makeHttpRequest("DELETE", "test", None) is None


@pytest.mark.asyncio
async def test_non_json_body_returns_the_response(client, send):
    response = FakeResponse(
        200, jsonError=aiohttp.client_exceptions.ContentTypeError(mock.Mock(), ())
    )
    send.return_value = response

    assert await client._makeHttpRequest("GET", "test", None) == {"response": response}


@pytest.mark.asyncio
async def test_success_fifth_try_status_code(client, send):
    expected = {"test": "works"}
    send.side_effect = [FakeResponse(500) for _ in range(4)] + [
        FakeResponse(200, expected)
    ]

    assert await client._makeHttpRequest("GET", "test", None) == expected
    assert send.await_count == 5


@pytest.mark.asyncio
async def test_backs_off_between_retries(client, send, noBackoff):
    send.side_effect = [FakeResponse(503), FakeResponse(503), FakeResponse(200, {})]

    await client._makeHttpRequest("GET", "test", None)
    assert noBackoff.await_count == 2


@pytest.mark.asyncio
async def test_exhaust_retries_status_code(client, send):
    send.return_value = FakeResponse(500, {"message": "msg", "test": "works"})

    with pytest.raises((aiohttp.ClientResponseError, exc.TaskclusterRestFailure)):
        await client._makeHttpRequest("GET", "test", None)
    # the first try plus maxRetries retries
    assert send.await_count == client.options["maxRetries"] + 1


@pytest.mark.xfail(
    strict=True,
    reason="the async client raises the raw aiohttp.ClientResponseError once retries "
    "on a 5xx are exhausted; the sync client raises TaskclusterRestFailure "
    "(see test_exhaust_retries_try_status_code in test/test_client.py)",
)
@pytest.mark.asyncio
async def test_exhaust_retries_status_code_raises_rest_failure(client, send):
    send.return_value = FakeResponse(500, {"message": "msg", "test": "works"})

    with pytest.raises(exc.TaskclusterRestFailure) as info:
        await client._makeHttpRequest("GET", "test", None)
    assert str(info.value) == "msg"
    assert info.value.status_code == 500
    assert info.value.body == {"message": "msg", "test": "works"}


@pytest.mark.asyncio
async def test_success_fifth_try_connection_errors(client, send):
    expected = {"test": "works"}
    send.side_effect = [aiohttp.ClientError() for _ in range(4)] + [
        FakeResponse(200, expected)
    ]

    assert await client._makeHttpRequest("GET", "test", None) == expected
    assert send.await_count == 5


@pytest.mark.asyncio
async def test_failure_connection_errors(client, send):
    send.side_effect = aiohttp.ClientError()

    with pytest.raises(exc.TaskclusterConnectionError):
        await client._makeHttpRequest("GET", "test", None)
    assert send.await_count == client.options["maxRetries"] + 1


@pytest.mark.asyncio
async def test_client_error_is_not_retried(client, send):
    send.return_value = FakeResponse(404, {"message": "no such thing"})

    with pytest.raises(exc.TaskclusterRestFailure) as info:
        await client._makeHttpRequest("GET", "test", None)
    assert send.await_count == 1
    assert str(info.value) == "no such thing"
    assert info.value.status_code == 404
    assert info.value.body == {"message": "no such thing"}


@pytest.mark.asyncio
async def test_client_error_without_message(client, send):
    send.return_value = FakeResponse(404, {"other": "data"})

    with pytest.raises(exc.TaskclusterRestFailure) as info:
        await client._makeHttpRequest("GET", "test", None)
    assert str(info.value).startswith("Unknown Server Error 404")


@pytest.mark.asyncio
async def test_unparseable_error_body_is_ignored(client, send):
    send.return_value = FakeResponse(400, jsonError=ValueError("not json"))

    with pytest.raises(exc.TaskclusterRestFailure) as info:
        await client._makeHttpRequest("GET", "test", None)
    assert info.value.status_code == 400
    assert info.value.body == {}


@pytest.mark.asyncio
async def test_401_raises_auth_failure(client, send):
    send.return_value = FakeResponse(401, {})

    with pytest.raises(exc.TaskclusterAuthFailure) as info:
        await client._makeHttpRequest("GET", "test", None)
    assert send.await_count == 1
    assert str(info.value) == "Authentication Error"
    assert info.value.status_code == 401


@pytest.mark.asyncio
async def test_hawk_header_sent_with_credentials(credentialedClient, send):
    send.return_value = FakeResponse(200, {})

    await credentialedClient._makeHttpRequest("GET", "test", None)
    header = send.await_args.args[3]["Authorization"]
    assert header.startswith("Hawk ")
    assert 'id="tester"' in header


@pytest.mark.asyncio
async def test_no_hawk_header_without_credentials(send):
    client = subject.Auth(
        {"rootUrl": base.TEST_ROOT_URL, "credentials": {}},
    )
    send.return_value = FakeResponse(200, {})

    await client._makeHttpRequest("GET", "test", None)
    assert "Authorization" not in send.await_args.args[3]


@pytest.mark.asyncio
async def test_session_is_passed_through(send):
    async with subject.createSession() as session:
        client = subject.Auth({"rootUrl": base.TEST_ROOT_URL}, session=session)
        send.return_value = FakeResponse(200, {})

        await client._makeHttpRequest("GET", "test", None)
        assert send.await_args.kwargs["session"] is session
