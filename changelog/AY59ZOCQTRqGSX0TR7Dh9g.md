audience: users
level: patch
---
The github service now verifies webhook signatures against the raw received
body instead of a reserialization of the parsed JSON. This fixes events not
being processed when certain characters that needed escaping were present in
events
