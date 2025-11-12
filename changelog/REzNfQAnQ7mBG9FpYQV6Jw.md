audience: worker-deployers
level: patch
---

Worker-manager adds extra Prometheus metrics for worker registration timing:
`worker_manager_worker_registration_seconds` - time from being requested to regsitered (running)
`worker_manager_worker_lifetime_seconds` - total lifetime of a worker (until stopped or removed)
`worker_manager_worker_registration_failures_total` - count of workers that were removed before register
