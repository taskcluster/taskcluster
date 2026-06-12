audience: deployers
level: minor
---
The worker-manager Azure provider now exposes ARM deployment creation failures and failed deployment operations as a Prometheus counter for observability.

New Prometheus metric:
- `worker_manager_azure_arm_deployment_errors_total` (counter) - incremented once for each ARM deployment creation failure or failed deployment operation, labeled by `providerId`, `workerPoolId`, `workerGroup`, `errorKind`, `errorCode`, `statusCode`, `provisioningState`, `provisioningOperation`, `targetResourceType`, `vmSize`, and `priority`.

This lets deployers chart Azure ARM deployment creation failures and failed operations by worker pool, region, Azure error code, and VM size in Prometheus/Grafana.
