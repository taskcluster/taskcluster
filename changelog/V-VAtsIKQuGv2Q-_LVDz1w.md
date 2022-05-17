audience: general
level: patch
---

Deprecate old Azure endpoints that are no longer use:
- `azureCredentials` (Can be migrated to `secrets` service)
- `azureTables`
- `azureTablesSAS`
- `azureContainers`
- `azureContainersSAS`

Remove test dependency on AZURE_ACCOUNT
