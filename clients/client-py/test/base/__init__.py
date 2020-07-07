""" Basic and helper things for testing the Taskcluster Python client"""
# -*- coding: utf-8 -*-
import os
import logging
import time

# Mocks really ought not to overwrite this
_sleep = time.sleep

TEST_ROOT_URL = "https://tc-tests.example.com"
# rootUrl of a real deployment (that needs no pre-configuration)
REAL_ROOT_URL = os.environ.get('TASKCLUSTER_ROOT_URL', 'https://community-tc.services.mozilla.com/')

log = logging.getLogger(__name__)
log.setLevel(logging.DEBUG)
log.addHandler(logging.NullHandler())
if os.environ.get('DEBUG_TASKCLUSTER_CLIENT'):
    log.addHandler(logging.StreamHandler())


def createApiRef(**kwargs):
    default = {
        'version': 0,
        'apiVersion': 'v1',
        'title': 'API Title',
        'description': 'API Description',
        'serviceName': 'fake',
        'exchangePrefix': 'exchange/taskcluster-fake/v1',
        'entries': []
    }
    default.update(kwargs)
    return {'reference': default}


def createApiEntryFunction(name, numArg, hasInput, method='get', **kwargs):
    if 'route' in kwargs:
        route = kwargs['route']
        fullArgs = [x[1:-1] for x in route.split('/') if x.startswith('<')]
    else:
        fullArgs = ['arg%d' % i for i in range(numArg)]
        routeChunks = ['/<%s>' % j for j in fullArgs]
        route = ''.join(routeChunks)
        route = '/%s%s' % (name, route)

    default = {
        'type': 'function',
        'method': method,
        'route': route,
        'name': name,
        'title': 'Test API Endpoint title',
        'description': 'Test API Endpoint Description',
        'output': 'http://localhost/schemas/v1/apiOutput',
        'args': fullArgs,
    }
    if hasInput:
        default['input'] = 'http://localhost/schemas/v1/apiInput'
    default.update(kwargs)
    return default


def createApiEntryTopicExchange(name, exchange, **kwargs):
    default = {
        'type': 'topic-exchange',
        'exchange': exchange,
        'name': name,
        'title': 'Test Topic Exchange',
        'description': 'Test Topic Exchange Description',
    }
    default.update(kwargs)
    return default


def createTopicExchangeKey(name, constant=None, multipleWords=False, maxSize=5,
                           required=False, **kwargs):
    default = {
        'name': name,
        'summary': 'A short description of the key',
        'maxSize': maxSize,
        'required': required,
        'multipleWords': multipleWords
    }
    if constant:
        default['constant'] = constant
    default.update(kwargs)
    return default


class AuthClient(object):
    def __init__(self, clientId, accessToken, expires, scopes):
        self.clientId = clientId
        self.accessToken = accessToken
        self.expires = expires
        self.scopes = scopes

    def forNode(self):
        return {
            'clientId': self.clientId,
            'accessToken': self.accessToken,
            'expires': self.expires,
            'scopes': self.scopes
        }
