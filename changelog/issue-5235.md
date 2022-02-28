audience: deployers
level: patch
reference: issue 5235
---
Added ingress to the web-server service to access the `__version__` and `__lbheartbeat__` endpoints. Can be reached at `/api/web-server/v1/{__version__, __lbheartbeat__}`.
These were added to comply with the [Dockerflow standard](https://github.com/mozilla-services/Dockerflow/#containerized-app-requirements).
