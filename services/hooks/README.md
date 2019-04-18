# Hooks Service

The hooks service creates tasks in response to events.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-hooks test` to run the test.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-hooks)`, then run the tests again.
