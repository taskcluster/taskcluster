from __future__ import absolute_import, division, print_function
import aiohttp
import aiohttp.hdrs
import asyncio
import logging
import os
import six

import taskcluster.utils as utils
import taskcluster.exceptions as exceptions

log = logging.getLogger(__name__)


def createSession(*args, **kwargs):
    return aiohttp.ClientSession(*args, **kwargs)


async def makeHttpRequest(method, url, payload, headers, retries=utils.MAX_RETRIES,
                          session=None, args=(), kwargs=None):
    """ Make an HTTP request and retry it until success, return request """
    retry = -1
    response = None
    while True:
        retry += 1
        # if this isn't the first retry then we sleep
        asyncio.sleep(utils.calculateSleepTime(retry))

        # Seek payload to start, if it is a file
        if hasattr(payload, 'seek'):
            payload.seek(0)

        log.debug('Making attempt %d', retry)
        try:
            response = await makeSingleHttpRequest(method, url, payload, headers,
                                                   session, args=args, kwargs=kwargs)
        except aiohttp.ClientError as rerr:
            if retry < retries:
                log.warn('Retrying because of: %s' % rerr)
                continue
            # raise a connection exception
            raise rerr
        except ValueError as rerr:
            log.warn('ValueError from aiohttp: redirect to non-http or https')
            raise rerr
        except RuntimeError as rerr:
            log.warn('RuntimeError from aiohttp: session closed')
            raise rerr
        # Handle non 2xx status code and retry if possible
        status = response.status
        if 500 <= status and status < 600 and retry < retries:
            log.warn('Retrying because of: %d status' % status)
            continue
        if status >= 200 and status < 300:
            return response
        raise exceptions.TaskclusterRestFailure("Unknown Server Error", superExc=None)


async def makeSingleHttpRequest(method, url, payload, headers, session=None,
                                args=(), kwargs=None):
    method = method.upper()
    kwargs = kwargs or {}
    log.debug('Making a %s request to %s', method, url)
    log.debug('HTTP Headers: %s' % str(headers))
    log.debug('HTTP Payload: %s (limit 100 char)' % str(payload)[:100])
    obj = session or createSession(*args, **kwargs)
    skip_auto_headers = [aiohttp.hdrs.CONTENT_TYPE]

    async with obj.request(
        method, url, data=payload, headers=headers,
        skip_auto_headers=skip_auto_headers, compress=False
    ) as resp:
        response_text = await resp.text()
        log.debug('Received HTTP Status:    %s' % resp.status)
        log.debug('Received HTTP Headers: %s' % str(resp.headers))
        log.debug('Received HTTP Payload: %s (limit 1024 char)' %
                  six.text_type(response_text)[:1024])
        return resp


async def putFile(filename, url, contentType, session=None):
    with open(filename, 'rb') as f:
        contentLength = os.fstat(f.fileno()).st_size
        return await makeHttpRequest('put', url, f, headers={
            'Content-Length': contentLength,
            'Content-Type': contentType,
        }, session=session)
