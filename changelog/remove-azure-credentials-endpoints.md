audience: general
level: major
---

The deprecated Auth service Azure Credentials API methods have been removed: `azureAccounts`,
`azureTables`, `azureTableSAS`, `azureContainers`, and `azureContainerSAS`. No known Taskcluster
component uses these methods.

The `auth.azure_accounts` Helm property is no longer allowed, and the corresponding
`AZURE_ACCOUNTS` environment variable is no longer used. Deployers must remove
`auth.azure_accounts` from their Helm values before upgrading.
