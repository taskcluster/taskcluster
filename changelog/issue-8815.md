level: minor
audience: admins
reference: issue 8815
---
The worker-manager worker scanner can now check workers with bounded concurrency instead of strictly one at a time.
It now checks up to 2 workers at once by default; set the `WORKER_SCANNER_CONCURRENCY` environment variable to tune this.
The per-provider CloudAPI rate limiter still bounds the actual cloud API call rate, so this only controls how much of that rate budget
each scan loop uses. Applies to both the Azure scanner and the GCP/AWS scanner.
