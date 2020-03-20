level: patch
reference: issue 2536
---
The node-postgres library is now configured to correctly handle timezones.  As no data was stored with timestamps until now, this is not a breaking change.
