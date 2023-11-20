from __future__ import division, print_function
import types
import time
import datetime
import urllib
import os
import re
import json
import copy

import mock
import httmock
import requests

import base
import taskcluster.auth as subject
import taskcluster.exceptions as exc
import taskcluster.utils as utils
import taskcluster_urls as liburls
import pytest
import functools

pytestmark = [
    pytest.mark.skipif(os.environ.get("NO_TESTS_OVER_WIRE"), reason="Skipping tests over wire")
]

REAL_TIME_SLEEP = time.sleep


@pytest.fixture(scope='function')
def apiRef(mocker):
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
    apiRef = base.createApiRef(entries=entries)

    yield apiRef


@pytest.fixture(scope='function')
def clientClass(apiRef):
    clientClass = subject.createApiClient('testApi', apiRef)
    yield clientClass


@pytest.fixture(scope='function')
def client(clientClass):
    client = clientClass({'rootUrl': base.TEST_ROOT_URL})
    yield client


@pytest.fixture(scope='function')
def patcher(client):
    patcher = mock.patch.object(client, 'NEVER_CALL_ME')
    yield patcher


def test_baseUrl_not_allowed(clientClass):
    with pytest.raises(exc.TaskclusterFailure):
        clientClass({'baseUrl': 'https://bogus.net'})


def test_rootUrl_set_correctly(clientClass):
    client = clientClass({'rootUrl': base.TEST_ROOT_URL})
    assert client.options['rootUrl'] == base.TEST_ROOT_URL


def test_apiVersion_set_correctly(clientClass):
    client = clientClass({'rootUrl': base.TEST_ROOT_URL})
    assert client.apiVersion == 'v1'


def test_apiVersion_set_correctly_default(apiRef):
    apiRef = copy.deepcopy(apiRef)
    del apiRef['reference']['apiVersion']
    clientClass = subject.createApiClient('testApi', apiRef)
    client = clientClass({'rootUrl': base.TEST_ROOT_URL})
    assert client.apiVersion == 'v1'


def test_serviceName_set_correctly(clientClass):
    client = clientClass({'rootUrl': base.TEST_ROOT_URL})
    assert client.serviceName == 'fake'


def test_valid_no_subs(client):
    provided = {'route': '/no/args/here', 'name': 'test'}
    expected = 'no/args/here'
    result = client._subArgsInRoute(provided, {})
    assert expected == result


def test_valid_one_sub(client):
    provided = {'route': '/one/<argToSub>/here', 'name': 'test'}
    expected = 'one/value/here'
    arguments = {'argToSub': 'value'}
    result = client._subArgsInRoute(provided, arguments)
    assert expected == result


def test_invalid_one_sub(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._subArgsInRoute({
            'route': '/one/<argToSub>/here',
            'name': 'test'
        }, {'unused': 'value'})


def test_invalid_route_no_sub(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._subArgsInRoute({
            'route': 'askldjflkasdf',
            'name': 'test'
        }, {'should': 'fail'})


def test_invalid_route_no_arg(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._subArgsInRoute({
            'route': 'askldjflkasdf',
            'name': 'test'
        }, {'should': 'fail'})


def test_no_args(client):
    assert ({}, None, {}, None, None) == client._processArgs({'args': [], 'name': 'test'})


def test_finds_payload(client):
    expected = ({}, {'a': 123}, {}, None, None)
    actual = client._processArgs({'args': [], 'name': 'test', 'input': True}, {'a': 123})
    assert expected == actual


def test_positional_args_only(client):
    expected = {'test': 'works', 'test2': 'still works'}
    entry = {'args': ['test', 'test2'], 'name': 'test'}
    actual = client._processArgs(entry, 'works', 'still works')
    assert (expected, None, {}, None, None) == actual


def test_keyword_args_only(client):
    expected = {'test': 'works', 'test2': 'still works'}
    entry = {'args': ['test', 'test2'], 'name': 'test'}
    actual = client._processArgs(entry, test2='still works', test='works')
    assert (expected, None, {}, None, None) == actual


def test_int_args(client):
    expected = {'test': 'works', 'test2': 42}
    entry = {'args': ['test', 'test2'], 'name': 'test'}
    actual = client._processArgs(entry, 'works', 42)
    assert (expected, None, {}, None, None) == actual


def test_keyword_and_positional(client):
    entry = {'args': ['test'], 'name': 'test'}
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs(entry, ['broken'], test='works')


def test_invalid_not_enough_args(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({'args': ['test'], 'name': 'test'})


def test_invalid_too_many_positional_args(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({'args': ['test'], 'name': 'test'}, 'enough', 'one too many')


def test_invalid_too_many_keyword_args(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({
            'args': ['test'],
            'name': 'test'
        }, test='enough', test2='one too many')


def test_invalid_missing_arg_positional(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({'args': ['test', 'test2'], 'name': 'test'}, 'enough')


def test_invalid_not_enough_args_because_of_overwriting(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({
            'args': ['test', 'test2'],
            'name': 'test'
        }, 'enough', test='enough')


def test_invalid_positional_not_string_empty_dict(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({'args': ['test'], 'name': 'test'}, {})


def test_invalid_positional_not_string_non_empty_dict(client):
    with pytest.raises(exc.TaskclusterFailure):
        client._processArgs({'args': ['test'], 'name': 'test'}, {'john': 'ford'})


def test_calling_convention_1_without_payload(client):
    params, payload, query, _, _ = client._processArgs({'args': ['k1', 'k2'], 'name': 'test'}, 1, 2)
    assert params == {'k1': 1, 'k2': 2}
    assert payload is None
    assert query == {}


def test_calling_convention_1_with_payload(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test', 'input': True},
        1,
        2,
        {'A': 123}
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload == {'A': 123}
    assert query == {}


def test_calling_convention_2_without_payload(client):
    params, payload, query, _, _ = client._processArgs({'args': ['k1', 'k2'], 'name': 'test'}, k1=1, k2=2)
    assert params == {'k1': 1, 'k2': 2}
    assert payload is None
    assert query == {}


def test_calling_convention_2_with_payload(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test', 'input': True},
        {'A': 123}, k1=1, k2=2
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload == {'A': 123}
    assert query == {}


def test_calling_convention_3_without_payload_without_query(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test'},
        params={'k1': 1, 'k2': 2}
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload is None
    assert query == {}


def test_calling_convention_3_with_payload_without_query(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test'},
        params={'k1': 1, 'k2': 2},
        payload={'A': 123}
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload == {'A': 123}
    assert query == {}


def test_calling_convention_3_with_payload_with_query(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test'},
        params={'k1': 1, 'k2': 2},
        payload={'A': 123},
        query={'B': 456}
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload == {'A': 123}
    assert query == {'B': 456}


def test_calling_convention_3_without_payload_with_query(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test'},
        params={'k1': 1, 'k2': 2},
        query={'B': 456}
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload is None
    assert query == {'B': 456}


def test_calling_convention_3_with_positional_arguments_with_payload_with_query(client):
    params, payload, query, _, _ = client._processArgs(
        {'args': ['k1', 'k2'], 'name': 'test'},
        1,
        2,
        query={'B': 456},
        payload={'A': 123}
    )
    assert params == {'k1': 1, 'k2': 2}
    assert payload == {'A': 123}
    assert query == {'B': 456}


def test_calling_convention_3_with_pagination(client):
    def a(x):
        return x

    _, _, _, ph, _ = client._processArgs({
        'args': ['k1', 'k2'],
        'name': 'test',
        'query': ['continuationToken', 'limit'],
    }, 1, 2, paginationHandler=a)
    assert ph is a


def test_calling_convention_3_with_pos_args_same_as_param_kwarg_dict_vals_with_payload_with_query(client):
    with pytest.raises(exc.TaskclusterFailure):
        params, payload, query, _, _ = client._processArgs(
            {'args': ['k1', 'k2'], 'name': 'test'},
            1,
            2,
            params={'k1': 1, 'k2': 2},
            query={'B': 456},
            payload={'A': 123}
        )


# This could probably be done better with Mock
class ObjWithDotJson(object):

    def __init__(self, status_code, x):
        self.status_code = status_code
        self.x = x

    def json(self):
        return self.x

    def raise_for_status(self):
        if self.status_code >= 400 or self.status_code < 200:
            raise requests.exceptions.HTTPError()


@pytest.fixture(scope='function')
def apiPath():
    return liburls.api(base.TEST_ROOT_URL, 'fake', 'v1', 'test')


def test_success_first_try(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        expected = {'test': 'works'}
        p.return_value = ObjWithDotJson(200, expected)

        print(apiPath)
        v = client._makeHttpRequest('GET', 'test', None)
        p.assert_called_once_with('GET', apiPath, None, mock.ANY)
        assert expected == v


def test_success_first_try_payload(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        expected = {'test': 'works'}
        p.return_value = ObjWithDotJson(200, expected)

        v = client._makeHttpRequest('GET', 'test', {'payload': 2})
        p.assert_called_once_with('GET', apiPath, utils.dumpJson({'payload': 2}), mock.ANY)
        assert expected == v


def test_success_fifth_try_status_code(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        expected = {'test': 'works'}
        sideEffect = [
            ObjWithDotJson(500, None),
            ObjWithDotJson(500, None),
            ObjWithDotJson(500, None),
            ObjWithDotJson(500, None),
            ObjWithDotJson(200, expected)
        ]
        p.side_effect = sideEffect
        expectedCalls = [mock.call('GET', apiPath, None, mock.ANY) for x in range(client.options['maxRetries'])]

        v = client._makeHttpRequest('GET', 'test', None)
        p.assert_has_calls(expectedCalls)
        assert expected == v


def test_exhaust_retries_try_status_code(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        msg = {'message': 'msg', 'test': 'works'}
        sideEffect = [
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),  # exhaust retries
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(500, msg),
            ObjWithDotJson(200, {'got this': 'wrong'})
        ]
        p.side_effect = sideEffect
        expectedCalls = [mock.call('GET', apiPath, None, mock.ANY) for x in range(client.options['maxRetries'] + 1)]

        with pytest.raises(exc.TaskclusterRestFailure):
            try:
                client._makeHttpRequest('GET', 'test', None)
            except exc.TaskclusterRestFailure as err:
                assert 'msg' == str(err)
                assert 500 == err.status_code
                assert msg == err.body
                raise err
        p.assert_has_calls(expectedCalls)


def test_success_fifth_try_connection_errors(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        expected = {'test': 'works'}
        sideEffect = [
            requests.exceptions.RequestException,
            requests.exceptions.RequestException,
            requests.exceptions.RequestException,
            requests.exceptions.RequestException,
            ObjWithDotJson(200, expected)
        ]
        p.side_effect = sideEffect
        expectedCalls = [mock.call('GET', apiPath, None, mock.ANY) for x in range(client.options['maxRetries'])]

        v = client._makeHttpRequest('GET', 'test', None)
        p.assert_has_calls(expectedCalls)
        assert expected == v


def test_redirect_status_code(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        p.return_value = ObjWithDotJson(301, None)
        expectedCalls = [mock.call('GET', apiPath, None, mock.ANY)]
        client._makeHttpRequest('GET', 'test', None)
        p.assert_has_calls(expectedCalls)


def test_failure_status_code(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        p.return_value = ObjWithDotJson(500, None)
        expectedCalls = [mock.call('GET', apiPath, None, mock.ANY) for x in range(client.options['maxRetries'])]
        with pytest.raises(exc.TaskclusterRestFailure):
            client._makeHttpRequest('GET', 'test', None)
        p.assert_has_calls(expectedCalls)


def test_failure_connection_errors(client, apiPath):
    with mock.patch.object(utils, 'makeSingleHttpRequest') as p:
        p.side_effect = requests.exceptions.RequestException
        expectedCalls = [mock.call('GET', apiPath, None, mock.ANY) for x in range(client.options['maxRetries'])]
        with pytest.raises(exc.TaskclusterConnectionError):
            client._makeHttpRequest('GET', 'test', None)
        p.assert_has_calls(expectedCalls)


def test_change_default_doesnt_change_previous_instances(client):
    prevMaxRetries = subject._defaultConfig['maxRetries']
    with mock.patch.dict(subject._defaultConfig, {'maxRetries': prevMaxRetries + 1}):
        assert client.options['maxRetries'] == prevMaxRetries


def test_credentials_which_cannot_be_encoded_in_unicode_work():
    badCredentials = {
        'accessToken': u"\U0001F4A9",
        'clientId': u"\U0001F4A9",
    }
    with pytest.raises(exc.TaskclusterAuthFailure):
        subject.Auth({
            'rootUrl': base.REAL_ROOT_URL,
            'credentials': badCredentials,
        })


def test_creates_methods(client):
    assert isinstance(client.no_args_no_input, types.MethodType)


def test_methods_setup_correctly(client):
    # Because of how scoping works, I've had trouble where the last API Entry
    # dict is used for all entires, which is wrong.  This is to make sure that
    # the scoping stuff isn't broken
    assert client.NEVER_CALL_ME is not client.no_args_no_input


def test_hits_no_args_no_input(client, patcher):
    expected = 'works'
    with mock.patch.object(client, '_makeHttpRequest') as patcher:
        patcher.return_value = expected

        actual = client.no_args_no_input()
        assert expected == actual

        patcher.assert_called_once_with('get', 'no_args_no_input', None)


def test_hits_two_args_no_input(client, patcher):
    expected = 'works'
    with mock.patch.object(client, '_makeHttpRequest') as patcher:
        patcher.return_value = expected

        actual = client.two_args_no_input('argone', 'argtwo')
        assert expected == actual

        patcher.assert_called_once_with('get', 'two_args_no_input/argone/argtwo', None)


def test_hits_no_args_with_input(client, patcher):
    expected = 'works'
    with mock.patch.object(client, '_makeHttpRequest') as patcher:
        patcher.return_value = expected

        actual = client.no_args_with_input({})
        assert expected == actual

        patcher.assert_called_once_with('get', 'no_args_with_input', {})


def test_hits_two_args_with_input(client, patcher):
    expected = 'works'
    with mock.patch.object(client, '_makeHttpRequest') as patcher:
        patcher.return_value = expected

        actual = client.two_args_with_input('argone', 'argtwo', {})
        assert expected == actual

        patcher.assert_called_once_with('get', 'two_args_with_input/argone/argtwo', {})


def test_input_is_procesed(client, patcher):
    expected = 'works'
    expected_input = {'test': 'does work'}
    with mock.patch.object(client, '_makeHttpRequest') as patcher:
        patcher.return_value = expected

        actual = client.no_args_with_input(expected_input)
        assert expected == actual

        patcher.assert_called_once_with('get', 'no_args_with_input', expected_input)


def test_kwargs(client, patcher):
    expected = 'works'
    with mock.patch.object(client, '_makeHttpRequest') as patcher:
        patcher.return_value = expected

        actual = client.two_args_with_input({}, arg0='argone', arg1='argtwo')
        assert expected == actual

        patcher.assert_called_once_with('get', 'two_args_with_input/argone/argtwo', {})


def test_mixing_kw_and_positional_fails(client):
    with pytest.raises(exc.TaskclusterFailure):
        client.two_args_no_input('arg1', arg2='arg2')


def test_missing_input_raises(client):
    with pytest.raises(exc.TaskclusterFailure):
        client.no_args_with_input()


def test_string_pass_through(client):
    expected = 'johnwrotethis'
    actual = client.topicName(expected)
    assert expected == actual['routingKeyPattern']


def test_exchange(client):
    expected = 'exchange/taskcluster-fake/v1/topicExchange'
    actual = client.topicName('')
    assert expected == actual['exchange']


def test_exchange_trailing_slash(client):
    client.options['exchangePrefix'] = 'exchange/taskcluster-fake2/v1/'
    expected = 'exchange/taskcluster-fake2/v1/topicExchange'
    actual = client.topicName('')
    assert expected == actual['exchange']


def test_constant(client):
    expected = 'primary.*.*.*.#'
    actual = client.topicName({})
    assert expected == actual['routingKeyPattern']


def test_does_insertion(client):
    expected = 'primary.*.value2.*.#'
    actual = client.topicName({'norm2': 'value2'})
    assert expected == actual['routingKeyPattern']


def test_too_many_star_args(client):
    with pytest.raises(exc.TaskclusterTopicExchangeFailure):
        client.topicName({'taskId': '123'}, 'another')


def test_both_args_and_kwargs(client):
    with pytest.raises(exc.TaskclusterTopicExchangeFailure):
        client.topicName({'taskId': '123'}, taskId='123')


def test_no_args_no_kwargs(client):
    expected = 'primary.*.*.*.#'
    actual = client.topicName()
    assert expected == actual['routingKeyPattern']
    actual = client.topicName({})
    assert expected == actual['routingKeyPattern']


@pytest.fixture(scope='function')
def apiPath_2():
    return liburls.api(base.TEST_ROOT_URL, 'fake', 'v1', 'two_args_no_input/arg0/arg1')


def test_build_url_positional(client, apiPath_2):
    actual = client.buildUrl('two_args_no_input', 'arg0', 'arg1')
    assert apiPath_2 == actual


def test_build_url_keyword(client, apiPath_2):
    actual = client.buildUrl('two_args_no_input', arg0='arg0', arg1='arg1')
    assert apiPath_2 == actual


def test_build_url_query_string(client, apiPath_2):
    actual = client.buildUrl(
        'two_args_no_input',
        params={
            'arg0': 'arg0',
            'arg1': 'arg1'
        },
        query={'qs0': 1}
    )
    assert apiPath_2 + '?qs0=1' == actual


def test_fails_to_build_url_for_missing_method(client):
    with pytest.raises(exc.TaskclusterFailure):
        client.buildUrl('non-existing')


def test_fails_to_build_not_enough_args(client):
    with pytest.raises(exc.TaskclusterFailure):
        client.buildUrl('two_args_no_input', 'not-enough-args')


@pytest.fixture(scope='function')
def apiPath_3():
    return liburls.api(base.TEST_ROOT_URL, 'fake', 'v1', 'two_args_no_input/arg0/arg1')


def test_builds_surl_positional(client, apiPath_3):
    actual = client.buildSignedUrl('two_args_no_input', 'arg0', 'arg1')
    actual = re.sub('bewit=[^&]*', 'bewit=X', actual)
    assert apiPath_3 + '?bewit=X' == actual


def test_builds_surl_keyword(client, apiPath_3):
    actual = client.buildSignedUrl('two_args_no_input', arg0='arg0', arg1='arg1')
    actual = re.sub('bewit=[^&]*', 'bewit=X', actual)
    assert apiPath_3 + '?bewit=X' == actual


def fakeSite(url, request, expected_url=None, expected_body=None):
    if expected_url is not None:
        assert urllib.parse.urlunsplit(url) == expected_url
    if expected_body is not None:
        assert json.loads(request.body) == expected_body
    return ""


def test_no_args_no_input(client):
    site = functools.partial(
        fakeSite,
        expected_url='https://tc-tests.example.com/api/fake/v1/no_args_no_input',
        # if we have an expected body, also pass `expected_body={...},`
    )
    with httmock.HTTMock(site):
        client.no_args_no_input()


def test_two_args_no_input(client):
    site = functools.partial(
        fakeSite,
        expected_url='https://tc-tests.example.com/api/fake/v1/two_args_no_input/1/2',
        # if we have an expected body, also pass `expected_body={...},`
    )
    with httmock.HTTMock(site):
        client.two_args_no_input('1', '2')


def test_no_args_with_input(client):
    site = functools.partial(
        fakeSite,
        expected_url='https://tc-tests.example.com/api/fake/v1/no_args_with_input',
        # if we have an expected body, also pass `expected_body={...},`
        expected_body={"x": 1}
    )
    with httmock.HTTMock(site):
        client.no_args_with_input({'x': 1})


def test_no_args_with_empty_input(client):
    site = functools.partial(
        fakeSite,
        expected_url='https://tc-tests.example.com/api/fake/v1/no_args_with_input',
        # if we have an expected body, also pass `expected_body={...},`
        expected_body={}
    )
    with httmock.HTTMock(site):
        client.no_args_with_input({})


def test_two_args_with_input(client):
    site = functools.partial(
        fakeSite,
        expected_url='https://tc-tests.example.com/api/fake/v1/two_args_with_input/a/b',
        # if we have an expected body, also pass `expected_body={...},`
        expected_body={"x": 1}
    )
    with httmock.HTTMock(site):
        client.two_args_with_input('a', 'b', {'x': 1})


def test_kwargs_with_input(client):
    site = functools.partial(
        fakeSite,
        expected_url='https://tc-tests.example.com/api/fake/v1/two_args_with_input/a/b',
        # if we have an expected body, also pass `expected_body={...},`
        expected_body={"x": 1}
    )
    with httmock.HTTMock(site):
        client.two_args_with_input({'x': 1}, arg0='a', arg1='b')


@pytest.mark.skipif(os.environ.get('NO_TESTS_OVER_WIRE'), reason="Skipping tests over wire")
def test_no_creds_needed():
    """we can call methods which require no scopes with an unauthenticated
    client"""
    # mock this request so we don't depend on the existence of a client
    @httmock.all_requests
    def auth_response(url, request):
        assert urllib.parse.urlunsplit(url) == 'https://tc-tests.example.com/api/auth/v1/clients/abc'
        assert not ('Authorization' in request.headers)
        headers = {'content-type': 'application/json'}
        content = {"clientId": "abc"}
        return httmock.response(200, content, headers, None, 5, request)

    with httmock.HTTMock(auth_response):
        client = subject.Auth({"rootUrl": "https://tc-tests.example.com", "credentials": {}})
        result = client.client('abc')
        assert result == {"clientId": "abc"}


def test_permacred_simple():
    """we can call methods which require authentication with valid
    permacreds"""
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': 'tester',
            'accessToken': 'no-secret',
        }
    })
    result = client.testAuthenticate({
        'clientScopes': ['test:a'],
        'requiredScopes': ['test:a'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:a'], 'clientId': 'tester'}


def test_permacred_simple_authorizedScopes():
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': 'tester',
            'accessToken': 'no-secret',
        },
        'authorizedScopes': ['test:a', 'test:b'],
    })
    result = client.testAuthenticate({
        'clientScopes': ['test:*'],
        'requiredScopes': ['test:a'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:a', 'test:b'], 'clientId': 'tester'}


def test_unicode_permacred_simple():
    """Unicode strings that encode to ASCII in credentials do not cause issues"""
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': u'tester',
            'accessToken': u'no-secret',
        }
    })
    result = client.testAuthenticate({
        'clientScopes': ['test:a'],
        'requiredScopes': ['test:a'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:a'], 'clientId': 'tester'}


def test_invalid_unicode_permacred_simple():
    """Unicode strings that do not encode to ASCII in credentials cause issues"""
    with pytest.raises(exc.TaskclusterAuthFailure):
        subject.Auth({
            'rootUrl': base.TEST_ROOT_URL,
            'credentials': {
                'clientId': u"\U0001F4A9",
                'accessToken': u"\U0001F4A9",
            }
        })


def test_permacred_insufficient_scopes():
    """A call with insufficient scopes results in an error"""
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': 'tester',
            'accessToken': 'no-secret',
        }
    })
    with pytest.raises(exc.TaskclusterRestFailure):
        client.testAuthenticate({
            'clientScopes': ['test:*'],
            'requiredScopes': ['something-more'],
        })


def test_temporary_credentials():
    """we can call methods which require authentication with temporary
    credentials generated by python client"""
    tempCred = subject.createTemporaryCredentials(
        'tester',
        'no-secret',
        datetime.datetime.utcnow(),
        datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        ['test:xyz'],
    )
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': tempCred,
    })

    result = client.testAuthenticate({
        'clientScopes': ['test:*'],
        'requiredScopes': ['test:xyz'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:xyz'], 'clientId': 'tester'}


def test_named_temporary_credentials():
    tempCred = subject.createTemporaryCredentials(
        'tester',
        'no-secret',
        datetime.datetime.utcnow(),
        datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        ['test:xyz'],
        name='credName'
    )
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': tempCred,
    })

    result = client.testAuthenticate({
        'clientScopes': ['test:*', 'auth:create-client:credName'],
        'requiredScopes': ['test:xyz'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:xyz'], 'clientId': 'credName'}


def test_temporary_credentials_authorizedScopes():
    tempCred = subject.createTemporaryCredentials(
        'tester',
        'no-secret',
        datetime.datetime.utcnow(),
        datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        ['test:xyz:*'],
    )
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': tempCred,
        'authorizedScopes': ['test:xyz:abc'],
    })

    result = client.testAuthenticate({
        'clientScopes': ['test:*'],
        'requiredScopes': ['test:xyz:abc'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:xyz:abc'], 'clientId': 'tester'}


def test_named_temporary_credentials_authorizedScopes():
    tempCred = subject.createTemporaryCredentials(
        'tester',
        'no-secret',
        datetime.datetime.utcnow(),
        datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        ['test:xyz:*'],
        name='credName'
    )
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': tempCred,
        'authorizedScopes': ['test:xyz:abc'],
    })

    result = client.testAuthenticate({
        'clientScopes': ['test:*', 'auth:create-client:credName'],
        'requiredScopes': ['test:xyz:abc'],
    })
    assert result == {'scopes': ['assume:anonymous', 'test:xyz:abc'], 'clientId': 'credName'}


def test_signed_url():
    """we can use a signed url built with the python client"""
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': 'tester',
            'accessToken': 'no-secret',
        }
    })
    signedUrl = client.buildSignedUrl('testAuthenticateGet')
    response = requests.get(signedUrl)
    response.raise_for_status()
    response = response.json()
    response['scopes'].sort()
    assert response == {
        'scopes': sorted(['assume:anonymous', 'test:*', u'auth:create-client:test:*']),
        'clientId': 'tester',
    }


def test_signed_url_bad_credentials():
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': 'tester',
            'accessToken': 'wrong-secret',
        }
    })
    signedUrl = client.buildSignedUrl('testAuthenticateGet')
    response = requests.get(signedUrl)
    with pytest.raises(requests.exceptions.RequestException):
        response.raise_for_status()
    assert 401 == response.status_code


def test_temp_credentials_signed_url():
    tempCred = subject.createTemporaryCredentials(
        'tester',
        'no-secret',
        datetime.datetime.utcnow(),
        datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        ['test:*'],
    )
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': tempCred,
    })
    signedUrl = client.buildSignedUrl('testAuthenticateGet')
    response = requests.get(signedUrl)
    response.raise_for_status()
    response = response.json()
    assert response == {
        'scopes': ['assume:anonymous', 'test:*'],
        'clientId': 'tester',
    }


def test_signed_url_authorizedScopes():
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': {
            'clientId': 'tester',
            'accessToken': 'no-secret',
        },
        'authorizedScopes': ['test:authenticate-get'],
    })
    signedUrl = client.buildSignedUrl('testAuthenticateGet')
    response = requests.get(signedUrl)
    response.raise_for_status()
    response = response.json()
    assert response == {
        'scopes': ['assume:anonymous', 'test:authenticate-get'],
        'clientId': 'tester',
    }


def test_temp_credentials_signed_url_authorizedScopes():
    tempCred = subject.createTemporaryCredentials(
        'tester',
        'no-secret',
        datetime.datetime.utcnow(),
        datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        ['test:*'],
    )
    client = subject.Auth({
        'rootUrl': base.REAL_ROOT_URL,
        'credentials': tempCred,
        'authorizedScopes': ['test:authenticate-get'],
    })
    signedUrl = client.buildSignedUrl('testAuthenticateGet')
    response = requests.get(signedUrl)
    response.raise_for_status()
    response = response.json()
    assert response == {
        'scopes': ['assume:anonymous', 'test:authenticate-get'],
        'clientId': 'tester',
    }
