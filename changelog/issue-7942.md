audience: deployers
level: patch
reference: issue 7942
---

New metrics are being exposed to prometheus for scraping:
- `http_requests_total` http requests per service/method/name
- `http_request_duration_seconds` http request duration histogram
- `auth_success_total` successful authentication attempt per clientId and scheme
- `auth_failure_total` failed authentication attempts and reasons

Existing queue metrics `queue_failed_tasks`, `queue_exception_tasks` now includes `reasonResolved` label
