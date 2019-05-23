# Worker Manager

The worker manager service manages workers, including interacting with cloud services to create new workers on demand.

It currently includes providers for:

* Static Workers
* Google Cloud

## workerTypeName

This service considers a "workerTypeName" to be a string of the shape `<provisionerId>/<workerType>`.
This definition is used internally and in the worker-manager API, with translations made to interact with other services such as Queue.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-worker-manager test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-worker-manager)`, then run the tests again.
