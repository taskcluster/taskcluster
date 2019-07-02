level: patch
---
The `GRAPHQL_SUBSCRIPTION_ENDPOINT` config for taskcluster-ui can now have scheme `http` or `https` instead of `ws`/`wss`.
This allows easier generation of this configuration as `${TASKCLUSTER_ROOT_URL}/subscription`.
The existing schemas are still accepted so no configuration change is required.
