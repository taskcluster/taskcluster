import re
from datetime import datetime, timedelta

# Regular expression matching: X days Y hours Z minutes
r = re.compile('^(\s*(\d+)\s*d(ays?)?)?' +
               '(\s*(\d+)\s*h(ours?)?)?' +
               '(\s*(\d+)\s*m(in(utes?)?)?)?\s*$')

def fromNow(offset = ""):
  # Parse offset
  m = r.match(offset)
  if m is None:
    raise ValueError("offset string: '%s' does not parse" % offset)

  # Offset datetime from utc
  date = datetime.utcnow() + timedelta(
    days    = int(m.group(2) or 0),
    hours   = int(m.group(5) or 0),
    minutes = int(m.group(8) or 0)
  )

  # Convert to isoFormat
  string = date.isoformat()

  # If there is no timezone and no Z added, we'll add one at the end.
  # This is just to be fully compliant with:
  # https://tools.ietf.org/html/rfc3339#section-5.6
  if date.utcoffset() is None and string[-1] != 'Z':
    return string + 'Z'
  return string
