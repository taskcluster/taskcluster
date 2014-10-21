import unittest
import httmock
import mock
import requests

import base
import taskcluster.client as subject
import taskcluster.exceptions as exc

class ClientTest(base.TCTest):
  def setUp(self):
    self.client = subject.Client('testApi', base.createApiRef())

class TestSubArgsInRoute(ClientTest):
  def test_valid_no_subs(self):
    provided = '/no/args/here'
    expected = 'no/args/here'
    result = self.client._subArgsInRoute(provided, {})
    self.assertEqual(expected, result)

  def test_valid_one_sub(self):
    provided = '/one/<argToSub>/here'
    expected = 'one/value/here'
    arguments = {'argToSub': 'value'}
    result = self.client._subArgsInRoute(provided, arguments)
    self.assertEqual(expected, result)
    
  def test_invalid_one_sub(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._subArgsInRoute('/one/<argToSub>/here', {'unused': 'value'})

  def test_invalid_route_no_sub(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._subArgsInRoute('adjfjlaksdfjs', {'should': 'fail'})
    
  def test_invalid_route_no_arg(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._subArgsInRoute('adjfjlaksdfjs', {'should': 'fail'})
    
    
class TestProcessArgs(ClientTest):
  def setUp(self):
    self.client = subject.Client('testApi', base.createApiRef())

  def test_no_args(self):
    self.assertEqual({}, self.client._processArgs([]))

  def test_positional_args_only(self):
    expected = {'test': 'works', 'test2': 'still works'}
    actual = self.client._processArgs(['test', 'test2'], 'works', 'still works')
    self.assertEqual(expected, actual)

  def test_keyword_args_only(self):
    expected = {'test': 'works', 'test2': 'still works'}
    actual = self.client._processArgs(['test', 'test2'], test2='still works', test='works')
    self.assertEqual(expected, actual)

  def test_keyword_overwrites_positional(self):
    expected = {'test': 'works'}
    actual = self.client._processArgs(['test'], 'broken', test='works')
    self.assertEqual(expected, actual)

  def test_invalid_not_enough_args(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._processArgs(['test'])

  def test_invalid_too_many_positional_args(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._processArgs(['test'], 'enough', 'one too many')

  def test_invalid_too_many_keyword_args(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._processArgs(['test'], test='enough', test2='one too many')

  def test_invalid_missing_arg_positional(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._processArgs(['test', 'test2'], 'enough')
      
  def test_invalid_not_enough_args_because_of_overwriting(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client._processArgs(['test', 'test2'], 'enough', test='enough')


class TestMakeSingleHttpRequest(ClientTest):
  def setUp(self):
    self.client = subject.Client('testApi', base.createApiRef())
  
  def test_success_no_payload(self):
    @httmock.all_requests
    def response_content(url, request):
      return {'status_code': 200, 'content': {}}

    with httmock.HTTMock(response_content):
      d = self.client._makeSingleHttpRequest('GET', 'http://www.example.com', {})
      self.assertEqual(d.json(), {})
      self.assertEqual(d.status_code, 200)
      d.raise_for_status()

  def test_success_payload(self):
    @httmock.all_requests
    def response_content(url, request):
      self.assertEqual(request.body, 'i=j')
      return {'status_code': 200, 'content': {'k': 'l'}}

    with httmock.HTTMock(response_content):
      d = self.client._makeSingleHttpRequest('GET', 'http://www.example.com', {'i': 'j'})
      self.assertEqual(d.json(), {'k': 'l'})
      self.assertEqual(d.status_code, 200)
      d.raise_for_status()

  def test_failure(self):
    @httmock.all_requests
    def response_content(url, requet):
      return {'status_code': 404}

    with httmock.HTTMock(response_content):
      d = self.client._makeSingleHttpRequest('GET', 'http://www.example.com', {})
      with self.assertRaises(requests.exceptions.RequestException):
        d.raise_for_status()


# This could probably be done better with Mock
class ObjWithDotJson(object):
  def __init__(self, status_code, x):
    self.status_code = status_code 
    self.x = x

  def json(self):
    return self.x
  
  def raise_for_status(self):
    if self.status_code >= 300 or self.status_code < 200:
      raise exc.TaskclusterRestFailure('Damn!', {})

class TestMakeHttpRequest(ClientTest):
  def setUp(self):
    self.client = subject.Client('testApi', base.createApiRef())

  def test_success_first_try(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      expected = {'test': 'works'}
      p.return_value = ObjWithDotJson(200, expected)

      v = self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_called_once_with('GET', 'http://www.example.com', {})
      self.assertEqual(expected, v)

  def test_success_fifth_try(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      expected = {'test': 'works'}
      sideEffect = [
        ObjWithDotJson(500, None),
        ObjWithDotJson(500, None),
        ObjWithDotJson(500, None),
        ObjWithDotJson(500, None),
        ObjWithDotJson(200, expected)
      ]
      p.side_effect = sideEffect
      expectedCalls = [mock.call('GET', 'http://www.example.com', {}) for x in range (self.client.maxRetries)]

      v = self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_has_calls(expectedCalls)
      self.assertEqual(expected, v)

  def test_failure(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      p.return_value = ObjWithDotJson(500, None)
      expectedCalls = [mock.call('GET', 'http://www.example.com', {}) for x in range (self.client.maxRetries)]
      with self.assertRaises(exc.TaskclusterRestFailure):
        v = self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_has_calls(expectedCalls)

