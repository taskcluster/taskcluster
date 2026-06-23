audience: deployers
level: minor
reference: issue 8161
---
The Azure provider now detects if resources will be cascade-deleted with the VM (`deleteOption: 'Delete'`).
When they provably cascade, deprovisioning skips the per-resource GET/delete walk and just calls VM delete + 404 confirm,
cutting the redundant Azure API calls.
Detection is best-effort and fails open: any uncertainty (multi-NIC/IP, `Detach`, missing fields, probe error/timeout, or
tracked resources that are not VM-owned) falls back to the existing resource-by-resource deletion.
New log type: `azure-teardown-mode` and `worker_manager_azure_teardown_total` metric record whether each teardown used the fast or slow path.
