audience: worker-deployers
level: minor
reference: issue 9424
---
Worker-manager's Azure provider no longer creates resources from the provisioner to avoid race condition with the worker scanner.
Both processes used to create resources and when provisioner's create was slow, it could land after scanner had already torn down a worker whose VM failed to be provisioned. This left unattached network interfaces or public IP dangling.
