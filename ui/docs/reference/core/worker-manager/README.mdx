# Worker Manager

The worker manager service manages workers, including interacting with cloud services to create new workers on demand.

## Providers

The service configuration defines a number of providers, indexed by `providerId`, along with configuration.
Each provider has a `providerType` indicating the class that implements the provider.

The service currently includes providers for:

* Static Workers ([`static`](/docs/reference/core/worker-manager/static))
* Google Cloud ([`google`](/docs/reference/core/worker-manager/google))
* AWS EC2 ([`aws`](/docs/reference/core/worker-manager/aws))

## Worker Pools

Workers are collected into worker pools.
Each worker pool is managed by a single provider and identified by a `workerPoolId`.
All workers in a pool pull from a task queue with`taskQueueId` equal to its `workerPoolId`, and as such are assumed to be identically configured and interchangeable.
Taskcluster provides no way to ensure that a specific task is executed by a specific worker.

A worker pool's provider can change, and the service distinguishes workers using the current provider and previous providers, automatically removing previous providers when they have no remaining workers.
The operation of deleting a worker pool takes the form of assigning the `"null-provider"` `providerId`.
This provider never creates workers, and pools are automatically deleted when their only provider is the null provider, thereby allowing pools to "drain" of running workers before disappearing.

## Workers

Workers are identified by a combination of a `workerGroup` and a `workerId`.
This combination is expected to be unique within a given worker pool.

How workers are managed depends on the provider.
In some cases, workers must be configured explicitly with API methods.
In other cases, the provider manages all aspects of the workers and no user control is available.
