audience: worker-deployers
level: patch
reference: issue 9424
---
Worker-manager's Azure provider no longer leaks network interfaces and public IPs for resource-based (non-ARM) launch configs. The provisioner used to create a worker's first resource itself, racing the worker scanner. Slow create could land after the scanner had already torn the worker down. Already-leaked resources need manual cleanup.

For ARM template launch configs, the scanner now waits up to 10 minutes for a new worker's deployment to appear instead of removing the worker right away.
