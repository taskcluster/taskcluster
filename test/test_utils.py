import datetime
import uuid
import os

import taskcluster.utils as subject
import httmock
import mock
import requests

import base
from unittest import TestCase
from hypothesis import given
import hypothesis.strategies as st


# https://docs.python.org/2/library/datetime.html#tzinfo-objects
class UTC(datetime.tzinfo):
  """UTC"""

  def utcoffset(self, dt):
      return datetime.timedelta(0)

  def tzname(self, dt):
      return 'UTC'

  def dst(self, dt):
      return datetime.timedelta(0)

utc = UTC()


class StringDateTests(base.TCTest):
  def test_naive(self):
    dateObj = datetime.datetime(
      year=2000,
      month=1,
      day=1,
      hour=1,
      minute=1,
      second=1
    )
    expected = '2000-01-01T01:01:01Z'
    actual = subject.stringDate(dateObj)
    self.assertEqual(expected, actual)

  def test_aware(self):
    dateObj = datetime.datetime(
      year=2000,
      month=1,
      day=1,
      hour=1,
      minute=1,
      second=1,
      tzinfo=utc
    )
    expected = '2000-01-01T01:01:01Z'
    actual = subject.stringDate(dateObj)
    self.assertEqual(expected, actual)


class DumpJsonTests(base.TCTest):
  def test_has_no_spaces(self):
    expected = '{"test":"works","doesit":"yes"}'
    actual = subject.dumpJson({'test': 'works', 'doesit': 'yes'})
    self.assertEqual(expected, actual)

  def test_serializes_naive_date(self):
    dateObj = datetime.datetime(
      year=2000,
      month=1,
      day=1,
      hour=1,
      minute=1,
      second=1
    )
    expected = '{"date":"2000-01-01T01:01:01Z"}'
    actual = subject.dumpJson({'date': dateObj})
    self.assertEqual(expected, actual)

  def test_serializes_aware_date(self):
    dateObj = datetime.datetime(
      year=2000,
      month=1,
      day=1,
      hour=1,
      minute=1,
      second=1,
      tzinfo=utc
    )
    expected = '{"date":"2000-01-01T01:01:01Z"}'
    actual = subject.dumpJson({'date': dateObj})
    self.assertEqual(expected, actual)


class TestBase64Utils(base.TCTest):
  def test_encode_string_for_b64_header(self):
    # Really long strings trigger newlines every 72 ch
    expected = 'YWJjZGVm' * 500
    actual = subject.encodeStringForB64Header('abcdef' * 500)
    self.assertEqual(expected, actual)

  def test_makeb64urlsafe(self):
    expected = '-_'
    actual = subject.makeB64UrlSafe('+/')
    self.assertEqual(expected, actual)

  def test_makeb64urlunsafe(self):
    expected = '+/'
    actual = subject.makeB64UrlUnsafe('-_')
    self.assertEqual(expected, actual)


class TestSlugId(base.TCTest):
  def test_slug_id_is_always_nice(self):
    with mock.patch('uuid.uuid4') as p:
      # first bit of uuid set, which should get unset
      p.return_value = uuid.UUID('bed97923-7616-4ec8-85ed-4b695f67ac2e')
      expected = 'Ptl5I3YWTsiF7UtpX2esLg'
      actual = subject.slugId()
      self.assertEqual(expected, actual)

  def test_slug_id_nice_stays_nice(self):
    with mock.patch('uuid.uuid4') as p:
      # first bit of uuid unset, should remain unset
      p.return_value = uuid.UUID('3ed97923-7616-4ec8-85ed-4b695f67ac2e')
      expected = 'Ptl5I3YWTsiF7UtpX2esLg'
      actual = subject.slugId()
      self.assertEqual(expected, actual)


class TestMakeSingleHttpRequest(base.TCTest):
  def test_success_no_payload(self):
    @httmock.all_requests
    def response_content(url, request):
      return {'status_code': 200, 'content': {}}

    with httmock.HTTMock(response_content):
      d = subject.makeSingleHttpRequest('GET', 'http://www.example.com', {}, {})
      self.assertEqual(d.json(), {})
      self.assertEqual(d.status_code, 200)
      d.raise_for_status()

  def test_success_payload(self):
    @httmock.all_requests
    def response_content(url, request):
      self.assertEqual(request.body, 'i=j')
      return {'status_code': 200, 'content': {'k': 'l'}}

    with httmock.HTTMock(response_content):
      d = subject.makeSingleHttpRequest('GET', 'http://www.example.com', {'i': 'j'}, {})
      self.assertEqual(d.json(), {'k': 'l'})
      self.assertEqual(d.status_code, 200)
      d.raise_for_status()

  def test_failure(self):
    @httmock.all_requests
    def response_content(url, requet):
      return {'status_code': 404}

    with httmock.HTTMock(response_content):
      d = subject.makeSingleHttpRequest('GET', 'http://www.example.com', {}, {})
      with self.assertRaises(requests.exceptions.RequestException):
        d.raise_for_status()


class TestPutfile(base.TCTest):
  def test_success_put_file(self):
    with mock.patch.object(subject, 'makeSingleHttpRequest') as p:
      subject.putFile('setup.py', 'http://www.example.com', 'text/plain')
      p.assert_called_once_with('put', 'http://www.example.com', mock.ANY, mock.ANY)


class TestStableSlugIdClosure(TestCase):

  @given(st.text())
  def test_repeat(self, text):
    s = subject.stableSlugId()
    self.assertEqual(s(text), s(text))

  def test_not_equal(self):
    s = subject.stableSlugId()
    self.assertNotEqual(s("first"), s("second"))

  @given(st.text())
  def test_invalidate(self, text):
    s1 = subject.stableSlugId()
    s2 = subject.stableSlugId()
    self.assertNotEqual(s1(text), s2(text))


class TestEncryptEnvVarMessage(TestCase):

  @given(st.text(), st.one_of(st.floats(), st.integers()),
         st.one_of(st.floats(), st.integers()), st.text(), st.text())
  def test_message_format(self, taskId, startTime, endTime, name, value):
    expected = {
      "messageVersion": "1",
      "taskId": taskId,
      "startTime": startTime,
      "endTime": endTime,
      "name": name,
      "value": value
    }
    self.assertDictEqual(expected, subject._messageForEncryptedEnvVar(
      taskId, startTime, endTime, name, value))


class TestEncrypt(TestCase):

  @given(st.text(), st.one_of(st.floats(), st.integers()),
         st.one_of(st.floats(), st.integers()), st.text(), st.text())
  def test_generic(self, taskId, startTime, endTime, name, value):
    key_file = os.path.join(os.path.dirname(__file__), "public.key")

    self.assertTrue(subject.encryptEnvVar(taskId, startTime, endTime, name,
                                          value, key_file).startswith("wcB"),
                    "Encrypted string should always start with 'wcB'")


class TestDecrypt(TestCase):

  def test_encypt_text(self):
    privateKey = os.path.join(os.path.dirname(__file__), "secret.key")
    publicKey = os.path.join(os.path.dirname(__file__), "public.key")
    text = "Hello \U0001F4A9!"
    encrypted = subject._encrypt(text, publicKey)
    self.assertNotEqual(text, encrypted)
    decrypted = subject._decrypt(encrypted, privateKey)
    self.assertEqual(text, decrypted)


class TestDecryptMessage(TestCase):

  def test_decryptMessage(self):
    privateKey = os.path.join(os.path.dirname(__file__), "secret.key")
    publicKey = os.path.join(os.path.dirname(__file__), "public.key")
    expected = {
      "messageVersion": "1",
      "taskId": "abcd",
      "startTime": 1,
      "endTime": 2,
      "name": "Name",
      "value": "Value"
    }
    encrypted = subject.encryptEnvVar("abcd", 1, 2, "Name", "Value", publicKey)
    decrypted = subject.decryptMessage(encrypted, privateKey)
    self.assertDictEqual(expected, decrypted)


class TestScopeMatch(TestCase):
  def assertScopeMatch(self, assumed, required_scope_sets, expected):
    try:
      result = subject.scope_match(assumed, required_scope_sets)
      self.assertEqual(result, expected)
    except:
      if expected != 'exception':
          raise

  def test_single_exact_match_string_except_1(self):
    self.assertScopeMatch(["foo:bar"], "foo:bar", "exception")

  def test_single_exact_match_string_except_2(self):
    self.assertScopeMatch(["foo:bar"], ["foo:bar"], "exception")

  def test_single_exact_match_string(self):
    self.assertScopeMatch(["foo:bar"], [["foo:bar"]], True)

  def test_empty_string_in_scopesets_except_1(self):
    self.assertScopeMatch(["foo:bar"], "", "exception")

  def test_empty_string_in_scopesets_except_2(self):
    self.assertScopeMatch(["foo:bar"], [""], "exception")

  def test_empty_string_in_scopesets(self):
    self.assertScopeMatch(["foo:bar"], [[""]], False)

  def test_prefix(self):
    self.assertScopeMatch(["foo:*"], [["foo:bar"]], True)

  def test_star_not_at_end(self):
    self.assertScopeMatch(["foo:*:bing"], [["foo:bar:bing"]], False)

  def test_star_at_beginnging(self):
    self.assertScopeMatch(["*:bar"], [["foo:bar"]], False)

  def test_prefix_with_no_star(self):
    self.assertScopeMatch(["foo:"], [["foo:bar"]], False)

  def test_star_but_not_prefix_1(self):
    self.assertScopeMatch(["foo:bar:*"], [["bar:bing"]], False)

  def test_star_but_not_prefix_2(self):
    self.assertScopeMatch(["bar:*"], [["foo:bar:bing"]], False)

  def test_disjunction_strings_except(self):
    self.assertScopeMatch(["bar:*"], ["foo:x", "bar:x"], "exception")

  def test_disjunction_strings_2(self):
    self.assertScopeMatch(["bar:*"], [["foo:x"], ["bar:x"]], True)

  def test_conjunction(self):
    self.assertScopeMatch(["bar:*", "foo:x"], [["foo:x", "bar:y"]], True)

  def test_empty_pattern(self):
    self.assertScopeMatch([""], [["foo:bar"]], False)

  def test_empty_patterns(self):
    self.assertScopeMatch([], [["foo:bar"]], False)

  def test_bare_star(self):
    self.assertScopeMatch(["*"], [["foo:bar", "bar:bing"]], True)

  def test_empty_conjunction_in_scopesets(self):
    self.assertScopeMatch(["foo:bar"], [[]], True)

  def test_non_string_scopesets(self):
    self.assertScopeMatch(["foo:bar"], {}, "exception")

  def test_non_string_scopeset(self):
    self.assertScopeMatch(["foo:bar"], [{}], "exception")

  def test_non_string_scope(self):
    self.assertScopeMatch(["foo:bar"], [[{}]], "exception")

  def test_empty_disjunction_in_scopesets(self):
    self.assertScopeMatch(["foo:bar"], [], False)
