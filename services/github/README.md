TaskCluster GitHub Service
==========================
[![Task Status](https://github.taskcluster.net/v1/repository/taskcluster/taskcluster-github/master/badge.svg)](https://github.taskcluster.net/v1/repository/taskcluster/taskcluster-github/master/latest)


This service monitors all of the repositories associated with an organization for changes and schedules TaskCluster tasks for any repository which contains a `.taskcluster.yml` configuration file. The goal of this project is to provide project owners a method for scheduling jobs in TaskCluster which is quick and straight forward.

**NOTE: This project used to provide a base docker image for convenience's sake, but it has been deprecated due to not being that useful and not being kept up-to-date. The image will continue existing, but we recommend migrating to another image.**

### Docs
See: https://docs.taskcluster.net/manual/vcs/github

### Adding status badges to your project's readme:
Insert the following string (replacing the words in caps with your organization or user name, repository name and the branch name) to the readme file in your project's repository:
`![Task Status](https://github.taskcluster.net/v1/badge/USERNAME/REPONAME/BRANCHNAME)`


## Components

### API Server
Listens for WebHooks and, if they are valid, forwards them to a pulse exchange.

### Handlers
Listen for WebHook triggered pulse messages and attempts to schedule TaskCluster tasks for any events related to a repository which contains a `.taskcluster.yml` file.

## Contributing

### Run Tests
To run the tests, use `npm test`.  No credentials are necessary.

To test the components separately, run:
- server: `npm run compile && <set the environment variables> node lib/main.js server`
- handlers: `npm run compile && <set the environment variables> node lib/main.js worker`

## Deploying

This service will auto-deploy *to staging* in Heroku once merged into master
and CI runs are successful. (You can install our staging integration [here](https://github.com/integration/taskcluster-staging).) If you need to force a deploy because we've broken
CI in some way and this urgently needs to be deployed, you can do it from the
[Heroku
console](https://dashboard-preview.heroku.com/apps/taskcluster-github/deploy/github).

Once the new version has been deployed to staging, you can verify it is working
with `npm run checkStaging`.  Note that you will need an active SSH key with
write access to https://github.com/taskcluster/taskcluster-github-testing to
run this check (but, no other credentials!)

After you confirm it works on stage, deploy to production with [the
pipeline](https://dashboard.heroku.com/pipelines/b867da9f-e443-4ddd-b8b1-2209532897b4).

## Copyright notes
Emoji fonts for this project were taken from:
- [Mozilla Firefox OS Emojis](https://github.com/mozilla/fxemoji)
- [Google Internationalization (i18n)](https://github.com/googlei18n/noto-emoji) (provided under the [SIL Open Font License, version 1.1](https://github.com/googlei18n/noto-emoji/blob/master/fonts/LICENSE))
- [EmojiOne](http://emojione.com/) (provided under the [Creative Commons License](http://emojione.com/licensing/))

## Service Owner

Service Owner: bstack@mozilla.com
