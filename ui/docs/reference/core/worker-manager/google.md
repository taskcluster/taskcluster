---
order: 10
title: Google Provider Type
---
import SchemaTable from 'taskcluster-ui/components/SchemaTable'

# Google Provider Type

Google-based providers create workers dynamically in GCE, using a single GCP project.
Best practice is to use a dedicated project for each provider that is not shared with other uses.
This isolates the workers from other GCP activities, protecting both from misuse or abuse.

## Worker Interaction

The provider starts workers with an instance attribute named `taskcluster` containing a JSON object with the following properties:

* `workerPoolId` -- worker pool for this worker
* `providerId` -- provider ID that started the worker
* `workerGroup` -- the worker's workerGroup (currently equal to the providerId, but do not depend on this)
* `rootUrl` -- root URL for the Taskcluster deployment
* `workerConfig` -- worker configuration supplied as part of the worker pool configuration
* `userData` -- userData from the worker pool configuration (deprecated)

The worker's `workerId` is identical to its instance ID, which can be retrieved from the GCP metadata service at `instance/id`.

The `workerIdentityProof` contains an [instance identity token](https://cloud.google.com/compute/docs/instances/verifying-instance-identity) in its `token` property:

```json
{"token": "<token>"}
```

The token should have audience equal to the deployment's `rootUrl` and `format=full`.

## Worker-Pool Configuration

Worker-pool configuration for a worker-pool using this provider type must match the following schema.

<SchemaTable schema="/schemas/worker-manager/v1/config-google.json" />
