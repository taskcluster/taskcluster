level: major
reference: issue 1005
---
There is now a checked-in helm chart in `infrastructure/k8s`. Using this anyone should
be able to deploy taskcluster by just setting up the configuration.

To facilitate this, some environment variables for configuring services have changed:

* All services now take `AZURE_ACCOUNT_ID` instead of `AZURE_ACCOUNT` or `AZURE_ACCOUNT_NAME`
* Hooks takes `AZURE_CRYPTO_KEY` and `AZURE_SIGNING_KEY` instead of `TABLE_CRYPTO_KEY` and `TABLE_SIGNING_KEY`
