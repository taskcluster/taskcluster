level: patch
reference: issue 2292
---
Add a new library taskcluster-lib-azqueue that exposes the same API as the Azure Queue service but uses Postgres rather than Azure. Note that all of the services are still using Azure. Services will eventually switch to using this new library. Date to be decided.
