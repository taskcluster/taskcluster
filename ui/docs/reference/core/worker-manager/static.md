---
order: 11
title: Static Provider Type
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

# Static Provider Type

The static provider type implements providers that do not dynamically create workers.
This is appropriate for cases where the workers are created outside of the Taskcluster deployment and do not respond to changes in task load.

## Worker Creation

Each worker in a worker pool managed by a provider of this type must be created via the `workerManager.createWorker` API method.
Unrecognized workers will not be given Taskcluster credentials.

This method requires a `providerData` field containing a `staticSecret` property.
This property must be a 44-character string, which is most easily created by concatenating two slugid's.
The secret for each worker should be different, to ensure that worker identities are authoritative.

The same secret must be provided by the worker when it calls `registerWorker` to get its credentials.
[Taskcluster-Worker-Runner](https://github.com/taskcluster/taskcluster-worker-runner) supports making such a call for you.

## Worker-Pool Configuration

Worker-pool configuration for a worker-pool using this provider type must match the following schema.

<SchemaTable schema="/schemas/worker-manager/v1/config-static.json" />
