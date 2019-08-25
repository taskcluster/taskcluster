# Worker Manager Service

The worker manager service manages workers, including interacting with cloud services to create new workers on demand.

# Development

No special configuration is required for development.

Run `yarn workspace taskcluster-worker-manager test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-worker-manager)`, then run the tests again.

## Implementing Providers

See [docs/providers.md](docs/providers.md) for details on implementing providers.
