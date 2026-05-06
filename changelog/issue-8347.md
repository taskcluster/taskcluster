audience: deployers
level: minor
reference: issue 8347
---
HTTP responses from Taskcluster API services are now gzip-compressed when the client sends `Accept-Encoding: gzip`. Compression is applied at the `@taskcluster/lib-api` router level with a 1 KB threshold, so small payloads are sent uncompressed.
