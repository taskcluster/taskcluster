import re
import json
import datetime
import base64
import logging
import os
import requests
import slugid
import time

MAX_RETRIES = 5

log = logging.getLogger(__name__)

try:
  # Do not require pgpy for all tasks
  import pgpy
except ImportError:
  pgpy = None
  log.debug("Encryption disabled. Install pgpy to enable.")

# Regular expression matching: X days Y hours Z minutes
r = re.compile('^(\s*(\d+)\s*d(ays?)?)?' +
               '(\s*(\d+)\s*h(ours?)?)?' +
               '(\s*(\d+)\s*m(in(utes?)?)?)?\s*$')


def fromNow(offset):
  # Parse offset
  m = r.match(offset)
  if m is None:
    raise ValueError("offset string: '%s' does not parse" % offset)

  # Offset datetime from utc
  date = datetime.datetime.utcnow() + datetime.timedelta(
    days=int(m.group(2) or 0),
    hours=int(m.group(5) or 0),
    minutes=int(m.group(8) or 0)
  )

  return stringDate(date)


def dumpJson(obj, **kwargs):
  """ Match JS's JSON.stringify.  When using the default seperators,
  base64 encoding JSON results in \n sequences in the output.  Hawk
  barfs in your face if you have that in the text"""
  def handleDateForJs(x):
    if isinstance(x, datetime.datetime) or isinstance(x, datetime.date):
      return stringDate(x)
    else:
      return x
  d = json.dumps(obj, separators=(',', ':'), default=handleDateForJs, **kwargs)
  assert '\n' not in d
  return d


def stringDate(date):
  # Convert to isoFormat
  string = date.isoformat()

  # If there is no timezone and no Z added, we'll add one at the end.
  # This is just to be fully compliant with:
  # https://tools.ietf.org/html/rfc3339#section-5.6
  if string.endswith('+00:00'):
    return string[:-6] + 'Z'
  if date.utcoffset() is None and string[-1] != 'Z':
    return string + 'Z'
  return string


def makeB64UrlSafe(b64str):
  """ Make a base64 string URL Safe """
  # see RFC 4648, sec. 5
  return b64str.replace('+', '-').replace('/', '_')


def makeB64UrlUnsafe(b64str):
  """ Make a base64 string URL Unsafe """
  # see RFC 4648, sec. 5
  return b64str.replace('-', '+').replace('_', '/')


def encodeStringForB64Header(s):
  """ HTTP Headers can't have new lines in them, let's  """
  return base64.encodestring(s).strip().replace('\n', '')


def slugId():
  """ Generate a taskcluster slugid.  This is a V4 UUID encoded into
  URL-Safe Base64 (RFC 4648, sec 5) with '=' padding removed """
  return slugid.nice()


def stableSlugId():
  """Returns a closure which can be used to generate stable slugIds.
  Stable slugIds can be used in a graph to specify task IDs in multiple
  places without regenerating them, e.g. taskId, requires, etc.
  """
  _cache = {}

  def closure(name):
    if name not in _cache:
      _cache[name] = slugId()
    return _cache[name]

  return closure


def scope_match(assumed_scopes, required_scope_sets):
  """
    Take a list of a assumed scopes, and a list of required scope sets on
    disjunctive normal form, and check if any of the required scope sets are
    satisfied.

    Example:

      required_scope_sets = [
        ["scopeA", "scopeB"],
        ["scopeC"]
      ]

    In this case assumed_scopes must contain, either:
    "scopeA" AND "scopeB", OR just "scopeC".
  """
  for scope_set in required_scope_sets:
    for required_scope in scope_set:
      for scope in assumed_scopes:
        if scope == required_scope:
          break     # required_scope satisifed, no need to check more scopes
        if scope.endswith("*") and required_scope.startswith(scope[:-1]):
          break     # required_scope satisifed, no need to check more scopes
      else:
        break       # required_scope not satisfied, stop checking scope_set
    else:
      return True   # scope_set satisfied, so we're happy
  return False      # none of the required_scope_sets were satisfied


def makeHttpRequest(method, url, payload, headers, retries=MAX_RETRIES):
  """ Make an HTTP request and retry it until success, return request """
  retry = -1
  response = None
  while retry < retries:
    retry += 1
    # if this isn't the first retry then we sleep
    if retry > 0:
      snooze = float(retry * retry) / 10.0
      log.info('Sleeping %0.2f seconds for exponential backoff', snooze)
      time.sleep(snooze)

    # Seek payload to start, if it is a file
    if hasattr(payload, 'seek'):
      payload.seek(0)

    log.debug('Making attempt %d', retry)
    try:
      response = makeSingleHttpRequest(method, url, payload, headers)
    except requests.exceptions.RequestException as rerr:
      if retry < retries:
        log.warn('Retrying because of: %s' % rerr)
        continue
      # raise a connection exception
      raise rerr
    # Handle non 2xx status code and retry if possible
    try:
      response.raise_for_status()
    except requests.exceptions.RequestException as rerr:
      status = response.status_code
      if 500 <= status and status < 600 and retry < retries:
        log.warn('Retrying because of: %s' % rerr)
        continue
      raise rerr

    # Otherwise return the result
    return response

  # This code-path should be unreachable
  assert False, "Error from last retry should have been raised!"


def makeSingleHttpRequest(method, url, payload, headers):
  method = method.upper()
  log.debug('Making a %s request to %s', method, url)
  log.debug('HTTP Headers: %s' % str(headers))
  log.debug('HTTP Payload: %s (limit 100 char)' % str(payload)[:100])
  response = requests.request(method.upper(), url, data=payload, headers=headers)
  log.debug('Received HTTP Status:  %s' % response.status_code)
  log.debug('Received HTTP Headers: %s' % str(response.headers))
  log.debug('Received HTTP Payload: %s (limit 1024 char)' % str(response.text)[:1024])

  return response


def putFile(filename, url, contentType):
  with open(filename, 'rb') as f:
    contentLength = os.fstat(f.fileno()).st_size
    return makeHttpRequest('put', url, f, headers={
      'Content-Length': contentLength,
      'Content-Type': contentType,
    })


def _messageForEncryptedEnvVar(taskId, startTime, endTime, name, value):
  return {
    "messageVersion": "1",
    "taskId": taskId,
    "startTime": startTime,
    "endTime": endTime,
    "name": name,
    "value": value
  }


def encryptEnvVar(taskId, startTime, endTime, name, value, keyFile):
  message = str(json.dumps(_messageForEncryptedEnvVar(
    taskId, startTime, endTime, name, value)))
  return base64.b64encode(_encrypt(message, keyFile))


def _encrypt(message, keyFile):
  """Encrypt and base64 encode message.

  :type message: str or unicode
  :type keyFile: str or unicode
  :return: base64 representation of binary (unarmoured) encrypted message
  """
  if not pgpy:
    raise RuntimeError("Install `pgpy' to use encryption")
  key, _ = pgpy.PGPKey.from_file(keyFile)
  msg = pgpy.PGPMessage.new(message)
  encrypted = key.encrypt(msg)
  return encrypted.__bytes__()


def decryptMessage(message, privateKey):
  """Decrypt base64-encoded message
  :param message: base64-encode message
  :param privateKey: path to private key
  :return: decrypted message dictionary
  """
  decodedMessage = base64.b64decode(message)
  return json.loads(_decrypt(decodedMessage, privateKey))


def _decrypt(blob, privateKey):
  """
  :param blob: encrypted binary string
  :param privateKey: path to private key
  :return: decrypted text

  """
  if not pgpy:
    raise RuntimeError("Install `pgpy' to use encryption")
  key, _ = pgpy.PGPKey.from_file(privateKey)
  msg = pgpy.PGPMessage()
  msg.parse(blob)
  decrypted = key.decrypt(msg)
  return decrypted.message
