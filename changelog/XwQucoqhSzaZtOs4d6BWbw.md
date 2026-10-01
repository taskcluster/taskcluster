audience: admins
level: patch
---
Web processes now bound how long a database call will wait for a free database connection to 10s instead of forever. When that wait trips, REST API endpoints now return a 503 `ServiceUnavailable` error instead of a 500.
