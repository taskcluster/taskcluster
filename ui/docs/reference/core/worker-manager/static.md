order: 11
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

# Static Provider Type

The static provider type implements providers that do not dynamically create workers.
This is appropriate for cases where the workers are created outside of the Taskcluster deployment and do not respond to changes in task load.

Each worker in a worker pool managed by a provider of this type must be created via the `workerManager.createWorker` API method.
Unrecognized workers will not be given Taskcluster credentials.

## Provider Configuration

A static provider is be configured in `providers` with the following structure:

```json
{
  "myProvider": {
    "providerType": "static"
  },
  ...
}
```

## Worker-Pool Configuration

Worker-pool configuration for a worker-pool using this provider type must match the following schema.

<SchemaTable schema="/schemas/worker-manager/v1/config-static.json" />
