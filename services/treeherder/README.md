# Treeherder Service

This service will respond to Taskcluster task events (e.g. task completed, task failed, etc) and compose a Treeherder job pulse message to report task status to Treeherder.

## Development and Testing

No special configuration is required for development.

Run `yarn workspace taskcluster-treeherder test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-treeherder)`, then run the tests again.
