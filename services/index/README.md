# Index Service

The index service provides a service that indexes successfully completed tasks.

Development
-----------

No special configuration is required for development.

Run `yarn workspace taskcluster-index test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-index)`, then run the tests again.
