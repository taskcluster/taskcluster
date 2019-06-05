# Worker Manager

The worker manager service manages workers, including interacting with cloud services to create new workers on demand.

## Providers

The service configuration defines a number of providers, indexed by `providerId`, along with configuration.
Each provider has a `providerType` indicating the class that implements the provider.

This service currently includes providers for:

* Static Workers (`static`)
* Google Cloud (`google`)
* Testing (`testing`, only used in the service's unit tests)

## Worker Identity

Workers are identified by a combination of a `workerGroup` and a `workerId`.
In order to ensure a unique identity for each worker, providers are expected to use their `providerId` as the `workerGroup`, but are free to choose an arbitrary (but unqiue and valid) `workerId` for each worker.

## workerPoolId

This service considers a "workerPoolId" to be a string of the shape `<provisionerId>/<workerType>`.
This definition is used internally and in the worker-manager API, with translations made to interact with other services such as Queue.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-worker-manager test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-worker-manager)`, then run the tests again.
