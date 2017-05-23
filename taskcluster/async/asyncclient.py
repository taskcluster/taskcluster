"""This module is used to interact with taskcluster rest apis"""

from __future__ import absolute_import, division, print_function

import os
import logging
import copy
import hashlib
import hmac
import datetime
import calendar
import six
from six.moves import urllib

import mohawk
import mohawk.bewit
import aiohttp
import asyncio

from .. import exceptions
from .. import utils
from ..client import BaseClient
from . import asyncutils

log = logging.getLogger(__name__)


# Default configuration
_defaultConfig = config = {
    'credentials': {
        'clientId': os.environ.get('TASKCLUSTER_CLIENT_ID'),
        'accessToken': os.environ.get('TASKCLUSTER_ACCESS_TOKEN'),
        'certificate': os.environ.get('TASKCLUSTER_CERTIFICATE'),
    },
    'maxRetries': 5,
    'signedUrlExpiration': 15 * 60,
}


def createSession(*args, **kwargs):
    """ Create a new aiohttp session.  This passes through all positional and
    keyword arguments to the aiohttp.CreateSession() constructor
    """
    return asyncutils.createSession(*args, **kwargs)


class AsyncBaseClient(BaseClient):
    """ Base Class for API Client Classes. Each individual Client class
    needs to set up its own methods for REST endpoints and Topic Exchange
    routing key patterns.  The _makeApiCall() and _topicExchange() methods
    help with this.
    """

    def _createSession(self):
        """ Create a new aiohttp session.
        """
        return createSession()

    async def _makeApiCall(self, entry, *args, **kwargs):
        """ This function is used to dispatch calls to other functions
        for a given API Reference entry"""

        payload = None
        _args = list(args)
        _kwargs = copy.deepcopy(kwargs)

        if 'input' in entry:
            if len(args) > 0:
                payload = _args.pop()
            else:
                raise exceptions.TaskclusterFailure('Payload is required as last positional arg')
        apiArgs = self._processArgs(entry, *_args, **_kwargs)
        route = self._subArgsInRoute(entry, apiArgs)
        log.debug('Route is: %s', route)

        return await self._makeHttpRequest(entry['method'], route, payload)

    async def _makeHttpRequest(self, method, route, payload):
        """ Make an HTTP Request for the API endpoint.  This method wraps
        the logic about doing failure retry and passes off the actual work
        of doing an HTTP request to another method."""

        baseUrl = self.options['baseUrl']
        # urljoin ignores the last param of the baseUrl if the base url doesn't end
        # in /.  I wonder if it's better to just do something basic like baseUrl +
        # route instead
        if not baseUrl.endswith('/'):
            baseUrl += '/'
        url = urllib.parse.urljoin(baseUrl, route.lstrip('/'))
        log.debug('Full URL used is: %s', url)

        hawkExt = self.makeHawkExt()

        # Serialize payload if given
        if payload is not None:
            payload = utils.dumpJson(payload)

        # Do a loop of retries
        retry = -1  # we plus first in the loop, and attempt 1 is retry 0
        retries = self.options['maxRetries']
        while retry < retries:
            retry += 1
            # if this isn't the first retry then we sleep
            if retry > 0:
                snooze = float(retry * retry) / 10.0
                log.info('Sleeping %0.2f seconds for exponential backoff', snooze)
                await asyncio.sleep(utils.calculateSleepTime(retry))
            # Construct header
            if self._hasCredentials():
                sender = mohawk.Sender(
                    credentials={
                        'id': self.options['credentials']['clientId'],
                        'key': self.options['credentials']['accessToken'],
                        'algorithm': 'sha256',
                    },
                    ext=hawkExt if hawkExt else {},
                    url=url,
                    content=payload if payload else '',
                    content_type='application/json' if payload else '',
                    method=method,
                )

                headers = {'Authorization': sender.request_header}
            else:
                log.debug('Not using hawk!')
                headers = {}
            if payload:
                # Set header for JSON if payload is given, note that we serialize
                # outside this loop.
                headers['Content-Type'] = 'application/json'

            log.debug('Making attempt %d', retry)
            try:
                response = await asyncutils.makeSingleHttpRequest(
                    method, url, payload, headers, session=self.session
                )
            except aiohttp.ClientError as rerr:
                if retry < retries:
                    log.warn('Retrying because of: %s' % rerr)
                    continue
                # raise a connection exception
                raise exceptions.TaskclusterConnectionError(
                    "Failed to establish connection",
                    superExc=rerr
                )

            status = response.status
            if status == 204:
                return None

            # Catch retryable errors and go to the beginning of the loop
            # to do the retry
            if 500 <= status and status < 600 and retry < retries:
                log.warn('Retrying because of a %s status code' % status)
                continue

            # Throw errors for non-retryable errors
            if status < 200 or status >= 300:
                # Parse messages from errors
                data = {}
                try:
                    data = await response.json()
                except:
                    pass  # Ignore JSON errors in error messages
                # Find error message
                message = "Unknown Server Error"
                if isinstance(data, dict):
                    message = data.get('message')
                else:
                    if status == 401:
                        message = "Authentication Error"
                    elif status == 500:
                        message = "Internal Server Error"
                    else:
                        message = "Unknown Server Error %s\n%s" % (str(status), str(data)[:1024])
                # Raise TaskclusterAuthFailure if this is an auth issue
                if status == 401:
                    raise exceptions.TaskclusterAuthFailure(
                        message,
                        status_code=status,
                        body=data,
                        superExc=None
                    )
                # Raise TaskclusterRestFailure for all other issues
                raise exceptions.TaskclusterRestFailure(
                    message,
                    status_code=status,
                    body=data,
                    superExc=None
                )

            # Try to load JSON
            try:
                await response.release()
                return await response.json()
            except ValueError:
                return {"response": response}

        # This code-path should be unreachable
        assert False, "Error from last retry should have been raised!"


def createApiClient(name, api):
    attributes = dict(
        name=name,
        __doc__=api.get('description'),
        classOptions={},
        funcinfo={},
    )

    copiedOptions = ('baseUrl', 'exchangePrefix')
    for opt in copiedOptions:
        if opt in api['reference']:
            attributes['classOptions'][opt] = api['reference'][opt]

    for entry in api['reference']['entries']:
        if entry['type'] == 'function':
            def addApiCall(e):
                async def apiCall(self, *args, **kwargs):
                    return await self._makeApiCall(e, *args, **kwargs)
                return apiCall
            f = addApiCall(entry)

            docStr = "Call the %s api's %s method.  " % (name, entry['name'])

            if entry['args'] and len(entry['args']) > 0:
                docStr += "This method takes:\n\n"
                docStr += '\n'.join(['- ``%s``' % x for x in entry['args']])
                docStr += '\n\n'
            else:
                docStr += "This method takes no arguments.  "

            if 'input' in entry:
                docStr += "This method takes input ``%s``.  " % entry['input']

            if 'output' in entry:
                docStr += "This method gives output ``%s``" % entry['output']

            docStr += '\n\nThis method does a ``%s`` to ``%s``.' % (
                entry['method'].upper(), entry['route'])

            f.__doc__ = docStr
            attributes['funcinfo'][entry['name']] = entry

        elif entry['type'] == 'topic-exchange':
            def addTopicExchange(e):
                def topicExchange(self, *args, **kwargs):
                    return self._makeTopicExchange(e, *args, **kwargs)
                return topicExchange

            f = addTopicExchange(entry)

            docStr = 'Generate a routing key pattern for the %s exchange.  ' % entry['exchange']
            docStr += 'This method takes a given routing key as a string or a '
            docStr += 'dictionary.  For each given dictionary key, the corresponding '
            docStr += 'routing key token takes its value.  For routing key tokens '
            docStr += 'which are not specified by the dictionary, the * or # character '
            docStr += 'is used depending on whether or not the key allows multiple words.\n\n'
            docStr += 'This exchange takes the following keys:\n\n'
            docStr += '\n'.join(['- ``%s``' % x['name'] for x in entry['routingKey']])

            f.__doc__ = docStr

        # Add whichever function we created
        f.__name__ = str(entry['name'])
        attributes[entry['name']] = f

    return type(utils.toStr(name), (BaseClient,), attributes)


def createTemporaryCredentials(clientId, accessToken, start, expiry, scopes, name=None):
    """ Create a set of temporary credentials

    clientId: the issuing clientId
    accessToken: the issuer's accessToken
    start: start time of credentials, seconds since epoch
    expiry: expiration time of credentials, seconds since epoch
    scopes: list of scopes granted
    name: credential name (optional)

    Returns a dictionary in the form:
        { 'clientId': str, 'accessToken: str, 'certificate': str}
    """

    now = datetime.datetime.utcnow()
    now = now - datetime.timedelta(minutes=10)  # Subtract 5 minutes for clock drift

    for scope in scopes:
        if not isinstance(scope, six.string_types):
            raise exceptions.TaskclusterFailure('Scope must be string')

    # Credentials can only be valid for 31 days.  I hope that
    # this is validated on the server somehow...

    if expiry - start > datetime.timedelta(days=31):
        raise exceptions.TaskclusterFailure('Only 31 days allowed')

    # We multiply times by 1000 because the auth service is JS and as a result
    # uses milliseconds instead of seconds
    cert = dict(
        version=1,
        scopes=scopes,
        start=calendar.timegm(start.utctimetuple()) * 1000,
        expiry=calendar.timegm(expiry.utctimetuple()) * 1000,
        seed=utils.slugId() + utils.slugId(),
    )

    # if this is a named temporary credential, include the issuer in the certificate
    if name:
        cert['issuer'] = utils.toStr(clientId)

    sig = ['version:' + utils.toStr(cert['version'])]
    if name:
        sig.extend([
            'clientId:' + utils.toStr(name),
            'issuer:' + utils.toStr(clientId),
        ])
    sig.extend([
        'seed:' + utils.toStr(cert['seed']),
        'start:' + utils.toStr(cert['start']),
        'expiry:' + utils.toStr(cert['expiry']),
        'scopes:'
    ] + scopes)
    sigStr = '\n'.join(sig).encode()

    if isinstance(accessToken, six.text_type):
        accessToken = accessToken.encode()
    sig = hmac.new(accessToken, sigStr, hashlib.sha256).digest()

    cert['signature'] = utils.encodeStringForB64Header(sig)

    newToken = hmac.new(accessToken, cert['seed'], hashlib.sha256).digest()
    newToken = utils.makeB64UrlSafe(utils.encodeStringForB64Header(newToken)).replace(b'=', b'')

    return {
        'clientId': name or clientId,
        'accessToken': newToken,
        'certificate': utils.dumpJson(cert),
    }


__all__ = [
    'createTemporaryCredentials',
    'config',
    'BaseClient',
    'createApiClient',
]
