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
    'entries': []
  }
  default.update(kwargs)
  return {'reference': default}

def createApiEntryFunction(numArg, hasInput, method='get', **kwargs):
  fullArgs = ['arg%d' % i for i in range(numArg)]
  routeChunks = ['/<%s>' % j for j in fullArgs]
  route = ''.join(routeChunks)
  default = {
    'type': 'function',
    'method': method,
    'route': route,
    'name': 'Test API Endpoint',
    'title': 'Test API Endpoint title',
    'description': 'Test API Endpoint Description',
    'output': 'http://localhost/schemas/v1/apiOutput'
  }
  if hasInput:
    default['input'] = 'http://localhost/schemas/v1/apiInput'
  default.update(kwargs)
  return default

def createApiEntryTopicExchange(numArg, hasInput, method='get', **kwargs):
  fullArgs = ['arg%d' % i for i in range(numArg)]
  routeChunks = ['/<%s>' % j for j in fullArgs]
  route = ''.join(routeChunks)
  default = {
    'type': 'function',
    'method': method,
    'route': route,
    'name': 'Test API Endpoint',
    'title': 'Test API Endpoint title',
    'description': 'Test API Endpoint Description',
    'output': 'http://localhost/schemas/v1/apiOutput'
  }
  if hasInput:
    default['input'] = 'http://localhost/schemas/v1/apiInput'
  default.update(kwargs)
  return default
