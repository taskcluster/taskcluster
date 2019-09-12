# Queue Service

This service is the central process coordinating execution of tasks in the Taskcluster setup.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-queue test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run *all* tests, you will need appropriate Taskcluster credentials.
Using [taskcluster-cli](https://github.com/taskcluster/taskcluster-cli), run `eval $(taskcluster signin --scope assume:project:taskcluster:tests:taskcluster-queue)`, then run the tests again.

To run even more tests you'll need a configuration file with access credentials for S3 and Azure Blob and Table Storage, as well as pulse credentials.
To do this, create a local configuration file `user-config.yml` in `services/queue`.
For safety reasons, this file is added to the `.gitignore` file.
There is an example `user-config-example.yml` to use for initial setup.

For S3 we have a dummy bucket called `test-bucket-for-any-garbage` which stores objects for 24 hours.
Mozilla developers can get access from a taskcluster developer, or you can setup a custom a bucket and overwrite the bucket name as well as the credentials.

Same thing applies for azure, though it's not as nicely scoped, and doesn't clean up on its own.
