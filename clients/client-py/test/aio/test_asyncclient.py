from unittest import mock

import aiohttp
import pytest

import taskcluster.exceptions as exc
import taskcluster.utils as utils
from taskcluster.aio import asyncclient, asyncutils, retry

pytestmark = pytest.mark.asyncio


async def test_generated_method_awaits_request(async_client, mocker):
    request = mocker.patch.object(
        async_client,
        "_makeHttpRequest",
        new=mocker.AsyncMock(return_value={"ok": True}),
    )

    assert await async_client.ping() == {"ok": True}
    request.assert_awaited_once_with("get", "ping", None)


async def test_success_first_try(async_client, api_path, make_response, mocker):
    response = make_response(200, {"ok": True})
    request = mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(return_value=response),
    )

    result = await async_client._makeHttpRequest("GET", "ping", None)

    assert result == {"ok": True}
    request.assert_awaited_once_with(
        "GET", api_path, None, {}, session=async_client.session
    )
    response.release.assert_awaited_once_with()


async def test_success_first_try_payload(async_client, api_path, make_response, mocker):
    response = make_response(200, {"ok": True})
    request = mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(return_value=response),
    )
    payload = {"payload": 2}

    result = await async_client._makeHttpRequest("POST", "ping", payload)

    assert result == {"ok": True}
    request.assert_awaited_once_with(
        "POST",
        api_path,
        utils.dumpJson(payload),
        {"Content-Type": "application/json"},
        session=async_client.session,
    )


async def test_redirect_status_code(async_client, make_response, mocker):
    response = make_response(301, {"redirect": True})
    request = mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(return_value=response),
    )

    result = await async_client._makeHttpRequest("GET", "ping", None)

    assert result == {"redirect": True}
    assert request.await_count == 1


async def test_no_content_returns_none(async_client, make_response, mocker):
    response = make_response(204)
    mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(return_value=response),
    )

    assert await async_client._makeHttpRequest("GET", "ping", None) is None
    response.json.assert_not_awaited()


async def test_server_error_retries_then_succeeds(async_client, make_response, mocker):
    failed_response = make_response(503, {"message": "unavailable"})
    successful_response = make_response(200, {"ok": True})
    request = mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(side_effect=[failed_response, successful_response]),
    )
    sleep = mocker.patch.object(retry.asyncio, "sleep", new=mocker.AsyncMock())

    result = await async_client._makeHttpRequest("GET", "ping", None)

    assert result == {"ok": True}
    assert request.await_count == 2
    sleep.assert_awaited_once()


async def test_connection_error_is_wrapped_after_retries(async_client, mocker):
    request = mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(side_effect=aiohttp.ClientConnectionError("offline")),
    )
    sleep = mocker.patch.object(retry.asyncio, "sleep", new=mocker.AsyncMock())

    with pytest.raises(exc.TaskclusterConnectionError) as raised:
        await async_client._makeHttpRequest("GET", "ping", None)

    assert isinstance(raised.value.superExc, aiohttp.ClientConnectionError)
    assert request.await_count == 3
    assert sleep.await_count == 2


async def test_auth_error_includes_response_body(async_client, make_response, mocker):
    body = {"message": "invalid credentials"}
    response = make_response(401, body)
    mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(return_value=response),
    )

    with pytest.raises(exc.TaskclusterAuthFailure) as raised:
        await async_client._makeHttpRequest("GET", "ping", None)

    assert str(raised.value) == "invalid credentials"
    assert raised.value.status_code == 401
    assert raised.value.body == body


async def test_non_json_response_is_returned(async_client, make_response, mocker):
    response = make_response(200)
    response.json.side_effect = ValueError
    mocker.patch.object(
        asyncutils,
        "makeSingleHttpRequest",
        new=mocker.AsyncMock(return_value=response),
    )

    assert await async_client._makeHttpRequest("GET", "ping", None) == {
        "response": response
    }
    response.release.assert_awaited_once_with()


async def test_context_manager_closes_implicit_session(async_client, mocker):
    session = mock.Mock()
    session.close = mocker.AsyncMock()
    create_session = mocker.patch.object(
        asyncclient, "createSession", return_value=session
    )

    async with async_client as opened_client:
        assert opened_client.session is session

    create_session.assert_called_once_with()
    session.close.assert_awaited_once_with()
    assert async_client.session is None
