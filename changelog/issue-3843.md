audience: general
level: patch
reference: issue 3843
---
Two bugs were fixed that together made it so that tasks could not use indexed images.

First is that docker-worker now correctly uses the task's credentials rather than
its own to query the index.
Second is that scopes are now expanded prior to limiting them with `authorizedScopes`
in addition to afterward.