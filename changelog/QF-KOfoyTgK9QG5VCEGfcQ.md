audience: deployers
level: patch
---
Added `__version__` and `__lbheartbeat__` endpoints to all services. Can be reached at `/api/<service name>/v1/{__version__, __lbheartbeat__}`.
These were added to comply with the [Dockerflow standard](https://github.com/mozilla-services/Dockerflow/#containerized-app-requirements).
