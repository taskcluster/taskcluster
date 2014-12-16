import re
import json
import datetime
import uuid
import base64

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
  return makeB64UrlSafe(encodeStringForB64Header(uuid.uuid4().bytes).replace('=', ''))
