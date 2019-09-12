# Notify Service

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-notify test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run all of the tests, you'll first need to set up your credentials based on how they are in `user-config-example.yml`.
Ask a Taskcluster team member for the AWS keys, etc.
`yarn install` and `yarn workspace taskcluster-notify test`.
You can set `DEBUG=taskcluster-notify,test` if you want to see what's going on.
