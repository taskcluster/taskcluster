audience: deployers
level: patch
reference: issue 5235
---
Added `__version__`, `__lbheartbeat__`, and `__heartbeat__` endpoints to web-server service. Can be reached at `/api/<service name>/v1/{__version__, __lbheartbeat__, __heartbeat__}`. `__heartbeat__` is simply returning a 200 empty JSON object for now - implementation to follow in individual PRs per service.
