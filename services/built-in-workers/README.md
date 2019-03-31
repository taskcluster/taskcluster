# Built-In Workers Service

This service implements the `built-in/succeed` and `built-in/fail` workerTypes, which simply succeed or fail immediately.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-built-in-workers test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-built-in-workers)`, then run the tests again.

## Deployment

This service simply interfaces with the queue service as a worker.
There is no API.

Since it does not perform any actual work, a single instance can easily keep up with any conceivable load, although deploying multiple instances is also possible.
