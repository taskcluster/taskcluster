audience: worker-deployers
level: minor
reference: issue 3347
---
The Azure provider now accepts an `ignoreFailedProvisioningStates` property in its launch configs which will cause it to ignore `ProvisioningState/failed/<code>` states on VMs.  This is specifically useful for ignoring OSProvisioningTimedOut when the Azure VM agent is not running.
