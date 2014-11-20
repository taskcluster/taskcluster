import types
import socket
import unittest
import time
realTimeTime = time.time
import datetime

import httmock
import mock
import requests

import base
import taskcluster.client as subject
import taskcluster.exceptions as exc


class ClientTest(base.TCTest):
  def setUp(self):
    subject.config['credentials'] = {
      'clientId': 'clientId',
      'accessToken': 'accessToken',
    }
    keys = [
      base.createTopicExchangeKey('primary_key', constant='primary'),
      base.createTopicExchangeKey('norm1'),
      base.createTopicExchangeKey('norm2'),
      base.createTopicExchangeKey('norm3'),
      base.createTopicExchangeKey('multi_key', multipleWords=True),
    ]
    topicEntry = base.createApiEntryTopicExchange('topicName', 'topicExchange', routingKey=keys)
    entries = [
      base.createApiEntryFunction('no_args_no_input', 0, False),
      base.createApiEntryFunction('two_args_no_input', 2, False),
      base.createApiEntryFunction('no_args_with_input', 0, True),
      base.createApiEntryFunction('two_args_with_input', 2, True),
      base.createApiEntryFunction('NEVER_CALL_ME', 0, False),
      topicEntry
    ]
    self.apiRef = base.createApiRef(entries=entries)
    self.clientClass = subject.createApiClient('testApi', self.apiRef)
    self.client = self.clientClass()
    # Patch time.sleep so that we don't delay tests
    sleepPatcher = mock.patch('time.sleep')
    sleepSleep = sleepPatcher.start()
    sleepSleep.return_value = None
    self.addCleanup(sleepSleep.stop)


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

    ClientTest.setUp(self)

  def test_success_first_try(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      expected = {'test': 'works'}
      p.return_value = ObjWithDotJson(200, expected)

      v = self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_called_once_with('GET', 'http://www.example.com', {}, 'e30=')
      self.assertEqual(expected, v)

  def test_success_fifth_try_status_code(self):
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
      expectedCalls = [mock.call('GET', 'http://www.example.com', {}, 'e30=')
                       for x in range(self.client.options['maxRetries'])]

      v = self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_has_calls(expectedCalls)
      self.assertEqual(expected, v)

  def test_success_fifth_try_connection_errors(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      expected = {'test': 'works'}
      sideEffect = [
        requests.exceptions.RequestException,
        requests.exceptions.RequestException,
        requests.exceptions.RequestException,
        requests.exceptions.RequestException,
        ObjWithDotJson(200, expected)
      ]
      p.side_effect = sideEffect
      expectedCalls = [mock.call('GET', 'http://www.example.com', {}, 'e30=')
                       for x in range(self.client.options['maxRetries'])]

      v = self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_has_calls(expectedCalls)
      self.assertEqual(expected, v)

  def test_failure_status_code(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      p.return_value = ObjWithDotJson(500, None)
      expectedCalls = [mock.call('GET', 'http://www.example.com', {}, 'e30=')
                       for x in range(self.client.options['maxRetries'])]
      with self.assertRaises(exc.TaskclusterRestFailure):
        self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_has_calls(expectedCalls)

  def test_failure_connection_errors(self):
    with mock.patch.object(self.client, '_makeSingleHttpRequest') as p:
      p.side_effect = requests.exceptions.RequestException
      expectedCalls = [mock.call('GET', 'http://www.example.com', {}, 'e30=')
                       for x in range(self.client.options['maxRetries'])]
      with self.assertRaises(exc.TaskclusterRestFailure):
        self.client._makeHttpRequest('GET', 'http://www.example.com', {})
      p.assert_has_calls(expectedCalls)


class TestOptions(ClientTest):
  def setUp(self):
    ClientTest.setUp(self)
    self.clientClass2 = subject.createApiClient('testApi', base.createApiRef())
    self.client2 = self.clientClass2({'baseUrl': 'http://notlocalhost:5888/v2'})

  def test_defaults_should_work(self):
    self.assertEqual(self.client.options['baseUrl'], 'https://localhost:8555/v1')
    self.assertEqual(self.client2.options['baseUrl'], 'http://notlocalhost:5888/v2')

  def test_change_default_doesnt_change_previous_instances(self):
    prevMaxRetries = subject._defaultConfig['maxRetries']
    with mock.patch.dict(subject._defaultConfig, {'maxRetries': prevMaxRetries + 1}):
      self.assertEqual(self.client.options['maxRetries'], prevMaxRetries)


class TestMakeApiCall(ClientTest):
  """ This class covers both the _makeApiCall function logic as well as the
  logic involved in setting up the api member functions since these are very
  related things"""

  def setUp(self):
    ClientTest.setUp(self)
    patcher = mock.patch.object(self.client, 'NEVER_CALL_ME')
    never_call = patcher.start()
    never_call.side_effect = AssertionError
    self.addCleanup(never_call.stop)

  def test_creates_methods(self):
    self.assertIsInstance(self.client.no_args_no_input, types.MethodType)

  def test_methods_setup_correctly(self):
    # Because of how scoping works, I've had trouble where the last API Entry
    # dict is used for all entires, which is wrong.  This is to make sure that
    # the scoping stuff isn't broken
    self.assertIsNot(self.client.NEVER_CALL_ME, self.client.no_args_no_input)

  def test_hits_no_args_no_input(self):
    expected = 'works'
    with mock.patch.object(self.client, '_makeHttpRequest') as patcher:
      patcher.return_value = expected

      actual = self.client.no_args_no_input()
      self.assertEqual(expected, actual)

      patcher.assert_called_once_with('get', 'no_args_no_input', None)

  def test_hits_two_args_no_input(self):
    expected = 'works'
    with mock.patch.object(self.client, '_makeHttpRequest') as patcher:
      patcher.return_value = expected

      actual = self.client.two_args_no_input('argone', arg1='argtwo')
      self.assertEqual(expected, actual)

      patcher.assert_called_once_with('get', 'two_args_no_input/argone/argtwo', None)

  def test_hits_no_args_with_input(self):
    expected = 'works'
    with mock.patch.object(self.client, '_makeHttpRequest') as patcher:
      patcher.return_value = expected

      actual = self.client.no_args_with_input()
      self.assertEqual(expected, actual)

      patcher.assert_called_once_with('get', 'no_args_with_input', None)

  def test_hits_two_args_with_input(self):
    expected = 'works'
    with mock.patch.object(self.client, '_makeHttpRequest') as patcher:
      patcher.return_value = expected

      actual = self.client.two_args_with_input('argone', arg1='argtwo')
      self.assertEqual(expected, actual)

      patcher.assert_called_once_with('get', 'two_args_with_input/argone/argtwo', None)

  def test_input_is_procesed(self):
    expected = 'works'
    expected_input = {'test': 'does work'}
    with mock.patch.object(self.client, '_makeHttpRequest') as patcher:
      patcher.return_value = expected

      actual = self.client.no_args_with_input(payload=expected_input)
      self.assertEqual(expected, actual)

      patcher.assert_called_once_with('get', 'no_args_with_input', expected_input)

  def test_missing_input_raises(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client.no_args_with_input({'malformed': 'payload'})
    with self.assertRaises(exc.TaskclusterFailure):
      self.client.no_args_with_input()


# TODO: I should run the same things through the node client and compare the output
class TestTopicExchange(ClientTest):
  def test_string_pass_through(self):
    expected = 'johnwrotethis'
    actual = self.client.topicName(expected)
    self.assertEqual(expected, actual['routingKeyPattern'])

  def test_exchange(self):
    expected = 'test/v1/topicExchange'
    actual = self.client.topicName('')
    self.assertEqual(expected, actual['exchange'])

  def test_exchange_trailing_slash(self):
    self.client.options['exchangePrefix'] = 'test/v1/'
    expected = 'test/v1/topicExchange'
    actual = self.client.topicName('')
    self.assertEqual(expected, actual['exchange'])

  def test_constant(self):
    expected = 'primary.*.*.*.#'
    actual = self.client.topicName({})
    self.assertEqual(expected, actual['routingKeyPattern'])

  def test_does_insertion(self):
    expected = 'primary.*.value2.*.#'
    actual = self.client.topicName({'norm2': 'value2'})
    self.assertEqual(expected, actual['routingKeyPattern'])

  def test_too_many_star_args(self):
    with self.assertRaises(exc.TaskclusterTopicExchangeFailure):
      self.client.topicName({'taskId': '123'}, 'another')

  def test_both_args_and_kwargs(self):
    with self.assertRaises(exc.TaskclusterTopicExchangeFailure):
      self.client.topicName({'taskId': '123'}, taskId='123')

  def test_no_args_no_kwargs(self):
    expected = 'primary.*.*.*.#'
    actual = self.client.topicName()
    self.assertEqual(expected, actual['routingKeyPattern'])
    actual = self.client.topicName({})
    self.assertEqual(expected, actual['routingKeyPattern'])


class TestBuildUrl(ClientTest):
  def test_build_url(self):
    expected = 'https://localhost:8555/v1/two_args_no_input/arg0/arg1'
    actual = self.client.buildUrl('two_args_no_input', 'arg0', arg1='arg1')
    self.assertEqual(expected, actual)

  def test_fails_to_build_url_for_missing_method(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client.buildUrl('non-existing')

  def test_fails_to_build_not_enough_args(self):
    with self.assertRaises(exc.TaskclusterFailure):
      self.client.buildUrl('two_args_no_input', 'not-enough-args')


class TestBuildSignedUrl(ClientTest):
  def setUp(self):
    ClientTest.setUp(self)
    # Patch time.time so that we get constant bewits for
    timePatcher = mock.patch('time.time')
    timePatch = timePatcher.start()
    timePatch.return_value = 1
    self.addCleanup(timePatch.stop)

  def test_builds_surl(self):
    expBewit = 'Y2xpZW50SWRcOTAxXENVUHFtY1lSeW5Ua' + \
               '3NBS1BDaTJLUm5palgwR3hpWjFRUE9rMF' + \
               'Viamc2U1U9XGUzMD0='
    expected = 'https://localhost:8555/v1/two_args_no_input/arg0/arg1?bewit=' + expBewit
    actual = self.client.buildSignedUrl('two_args_no_input', 'arg0', arg1='arg1')
    self.assertEqual(expected, actual)


class TestSlugId(base.TCTest):
  def test_slug_id(self):
    with mock.patch('uuid.uuid4') as p:
      p.return_value = '8ed7ba5e-380b-4c08-aa9c-1c86382afe23'
      expected = 'OGVkN2JhNWUtMzgwYi00YzA4LWFhOWMtMWM4NjM4MmFmZTIz'
      actual = subject.slugId()
      self.assertEqual(expected, actual)


class TestAuthenticationMockServer(base.TCTest):
  def setUp(self):
    self.port = 5555
    self.baseUrl = 'http://localhost:%d/v1' % self.port

    entries = [
      base.createApiEntryFunction(
        'getCredentials',
        0,
        False,
        route='/client/<clientId>/credentials'
      ),
    ]
    self.apiRef = base.createApiRef(entries=entries)
    self.clientClass = subject.createApiClient('Auth', self.apiRef)
    clientOpts = {
      'baseUrl': self.baseUrl
    }
    self.client = self.clientClass(clientOpts)

  def test_mock_is_up(self):
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
      s.connect(('127.0.0.1', self.port))
    finally:
      s.close()

  def test_mock_auth_works(self):
    self.client.options['credentials']['clientId'] = 'admin'
    self.client.options['credentials']['accessToken'] = 'adminToken'
    result = self.client.getCredentials('admin')
    self.assertEqual(result['accessToken'], 'adminToken')

  def test_mock_auth_works_with_small_scope(self):
    self.client.options['credentials']['clientId'] = 'goodScope'
    self.client.options['credentials']['accessToken'] = 'goodScopeToken'
    result = self.client.getCredentials('admin')
    self.assertEqual(result['accessToken'], 'adminToken')

  def test_mock_auth_invalid(self):
    self.client.options['credentials']['clientId'] = 'unknown'
    self.client.options['credentials']['accessToken'] = 'adminToken'
    with self.assertRaises(exc.TaskclusterAuthFailure):
      self.client.getCredentials('admin')

  def test_mock_auth_expired(self):
    self.client.options['credentials']['clientId'] = 'expired'
    self.client.options['credentials']['accessToken'] = 'expiredToken'
    with self.assertRaises(exc.TaskclusterAuthFailure):
      self.client.getCredentials('admin')

  def test_mock_auth_bad_scope(self):
    self.client.options['credentials']['clientId'] = 'badScope'
    self.client.options['credentials']['accessToken'] = 'badScopeToken'
    with self.assertRaises(exc.TaskclusterAuthFailure):
      self.client.getCredentials('admin')

  @unittest.expectedFailure
  def test_temporary_credentials(self):
    tempCred = subject.createTemporaryCredentials(
      'admin',
      'adminToken',
      datetime.datetime.utcnow() - datetime.timedelta(hours=10),
      datetime.datetime.utcnow() + datetime.timedelta(hours=10),
      ['auth:credentials'],
    )
    self.client.options['credentials']['clientId'] = tempCred['clientId']
    self.client.options['credentials']['accessToken'] = tempCred['accessToken']
    self.client.options['credentials']['certificate'] = tempCred['certificate']
    result = self.client.getCredentials('admin')
    self.assertEqual(result['accessToken'], 'adminToken')

  def test_mock_auth_signed_url(self):
    self.client.options['credentials']['clientId'] = 'admin'
    self.client.options['credentials']['accessToken'] = 'adminToken'
    signedUrl = self.client.buildSignedUrl('getCredentials', 'admin')
    response = requests.get(signedUrl)
    response.raise_for_status()
    response = response.json()
    self.assertEqual(response['accessToken'], 'adminToken')

  def test_mock_auth_signed_url_bad_credentials(self):
    self.client.options['credentials']['clientId'] = 'expired'
    self.client.options['credentials']['accessToken'] = 'expiredToken'
    signedUrl = self.client.buildSignedUrl('getCredentials', 'admin')
    r = requests.get(signedUrl)
    with self.assertRaises(requests.exceptions.RequestException):
      r.raise_for_status()
    self.assertEqual(401, r.status_code)
