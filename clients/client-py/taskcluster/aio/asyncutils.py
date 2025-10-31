import asyncio
import functools
import logging
import os

import aiohttp
import aiohttp.hdrs
import async_timeout

import taskcluster.exceptions as exceptions
import taskcluster.utils as utils

log = logging.getLogger(__name__)


def createSession(*args, **kwargs):
    return aiohttp.ClientSession(*args, **kwargs)


# Useful information: https://www.blog.pythonlibrary.org/2016/07/26/python-3-an-intro-to-asyncio/
async def makeHttpRequest(
    method, url, payload, headers, retries=utils.MAX_RETRIES, session=None
):
    """Make an HTTP request and retry it until success, return request"""
    retry = -1
    response = None
    implicit = False
    if session is None:
        implicit = True
        session = aiohttp.ClientSession()

    def cleanup():
        if implicit:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(session.close())

    try:
        while True:
            retry += 1
            # if this isn't the first retry then we sleep
            if retry > 0:
                snooze = float(retry * retry) / 10.0
                log.info("Sleeping %0.2f seconds for exponential backoff", snooze)
                await asyncio.sleep(snooze)

            # Seek payload to start, if it is a file
            if hasattr(payload, "seek"):
                payload.seek(0)

            log.debug("Making attempt %d", retry)
            try:
                with async_timeout.timeout(60):
                    response = await makeSingleHttpRequest(
                        method, url, payload, headers, session
                    )
            except aiohttp.ClientError as rerr:
                if retry < retries:
                    log.warning(f"Retrying because of: {rerr}")
                    continue
                # raise a connection exception
                raise rerr
            except ValueError as rerr:
                log.warning("ValueError from aiohttp: redirect to non-http or https")
                raise rerr
            except RuntimeError as rerr:
                log.warning("RuntimeError from aiohttp: session closed")
                raise rerr
            # Handle non 2xx status code and retry if possible
            status = response.status
            if 500 <= status and status < 600 and retry < retries:
                if retry < retries:
                    log.warning(f"Retrying because of: {status} status")
                    continue
                else:
                    raise exceptions.TaskclusterRestFailure(
                        "Unknown Server Error", superExc=None
                    )
            return response
    finally:
        cleanup()
    # This code-path should be unreachable
    assert False, "Error from last retry should have been raised!"


async def makeSingleHttpRequest(method, url, payload, headers, session=None):
    method = method.upper()
    log.debug("Making a %s request to %s", method, url)
    log.debug(f"HTTP Headers: {str(headers)}")
    log.debug(f"HTTP Payload: {str(payload)[:100]} (limit 100 char)")
    implicit = False
    if session is None:
        implicit = True
        session = aiohttp.ClientSession()

    skip_auto_headers = [aiohttp.hdrs.CONTENT_TYPE]

    try:
        # https://docs.aiohttp.org/en/stable/client_quickstart.html#passing-parameters-in-urls
        # we must avoid aiohttp's helpful "requoting" functionality, as it breaks Hawk signatures
        url = aiohttp.client.URL(url, encoded=True)
        async with session.request(
            method,
            url,
            data=payload,
            headers=headers,
            skip_auto_headers=skip_auto_headers,
            compress=False,
        ) as resp:
            response_text = await resp.text()
            log.debug(f"Received HTTP Status:    {resp.status}")
            log.debug(f"Received HTTP Headers: {str(resp.headers)}")
            log.debug(
                f"Received HTTP Payload: {str(response_text)[:1024]} (limit 1024 char)"
            )
            return resp
    finally:
        if implicit:
            await session.close()


async def putFile(filename, url, contentType, session=None):
    with open(filename, "rb") as f:
        contentLength = os.fstat(f.fileno()).st_size
        return await makeHttpRequest(
            "put",
            url,
            f,
            headers={
                "Content-Length": str(contentLength),
                "Content-Type": contentType,
            },
            session=session,
        )


def runAsync(coro):
    """
    Replacement of asyncio.run, as it doesn't exist in python<3.7.
    """
    asyncio.set_event_loop(asyncio.new_event_loop())
    loop = asyncio.get_event_loop()
    result = loop.run_until_complete(coro)
    loop.close()
    return result


def ensureCoro(func):
    """
    If func is a regular function, execute in a thread and return an
    async version of it. If func is already an async function, return
    it without change.
    """
    if asyncio.iscoroutinefunction(func):
        return func

    @functools.wraps(func)
    async def coro(*args, **kwargs):
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, functools.partial(func, *args, **kwargs)
        )

    return coro
