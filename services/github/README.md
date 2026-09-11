# GitHub Service

The GitHub service monitors all of the repositories associated with an organization for changes and schedules Taskcluster tasks for any repository which contains a `.taskcluster.yml` configuration file.

## Components

### API Server
Listens for WebHooks and, if they are valid, forwards them to a pulse exchange.

### Handlers
Listen for WebHook-triggered pulse messages and attempts to schedule Taskcluster tasks for any events related to a repository which contains a `.taskcluster.yml` file.

## Contributing

### Run Tests
No special configuration is required for development.

Run `yarn workspace @taskcluster/github test` to run the tests. Some of the tests will be skipped without additional credentials, but it is fine to make a pull request as long as no tests fail.

To run all of the tests, you'll first need to set up your credentials based on how they are in `user-config-example.yml`. Ask a Taskcluster team member for the AWS keys, etc.

Run `yarn install` and `yarn workspace @taskcluster/github test`.

To test the components separately, run:
- server: `<set the environment variables> node services/github/src/main.js server`
- handlers: `<set the environment variables> node services/github/src/main.js worker`

## Copyright notes

Emoji fonts for this project were taken from:
- [Mozilla Firefox OS Emojis](https://github.com/mozilla/fxemoji)
- [Google Internationalization (i18n)](https://github.com/googlei18n/noto-emoji) (provided under the [SIL Open Font License, version 1.1](https://github.com/googlei18n/noto-emoji/blob/master/fonts/LICENSE))
- [EmojiOne](http://emojione.com/) (provided under the [Creative Commons License](http://emojione.com/licensing/))
