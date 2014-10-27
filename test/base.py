""" Basic and helper things for testing the Taskcluster Python client"""
import unittest


class TCTest(unittest.TestCase):
  """ Let's have a common base class for all Taskcluster-client tests."""
  pass


def createApiRef(**kwargs):
  default = {
    'version': '0.0.1',
    'title': 'API Title',
    'description': 'API Description',
    'baseUrl': 'https://localhost:8555/v1',
    'exchangePrefix': 'test/v1',
    'entries': []
  }
  default.update(kwargs)
  return {'reference': default}

def createApiEntryFunction(name, numArg, hasInput, method='get', **kwargs):
  fullArgs = ['arg%d' % i for i in range(numArg)]
  routeChunks = ['/<%s>' % j for j in fullArgs]
  route = ''.join(routeChunks)
  default = {
    'type': 'function',
    'method': method,
    'route': '/%s%s' %(name, route),
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

def createTopicExchangeKey(name, constant=None, multipleWords=False, maxSize=5, required=False, **kwargs):
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

