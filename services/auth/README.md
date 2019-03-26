# Auth Service

The auth service manages permissions and credentials in a Taskcluster deployment.

## Development

No special configuration is required for development.

Run `yarn workspace taskcluster-hooks test` to run the tess.
Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

If you are modifying something requiring credentials, you may need to set up credentials.
To do so, copy `user-config-example.yml` to `user-config.yml` and fill in the necessary credentials based on the comments in that file.
Taskcluster team members can provide you with some testing-only credentials -- just ask, and provide a GPG key (use https://keybase.io if you don't have one).
You can get your own pulse credentials at https://pulseguardian.mozilla.org.

The taskcluster team has a series of [best practices](/docs/manual/devel/best-practices) which may help guide you in modifying the source code and making a pull request.
