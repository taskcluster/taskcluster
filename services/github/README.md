TaskCluster GitHub Service
==========================
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-github.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-github)

This service monitors all of the repositories associated with an organization for changes and schedules TaskCluster tasks for any repository which contains a `.taskcluster.yml` configuration file. The goal of this project is to provide project owners a method for scheduling jobs in TaskCluster which is quick and straight forward.

**NOTE: This project used to provide a base docker image for convenience's sake, but it has been deprecated due to not being that useful and not being kept up-to-date. The image will continue existing, but we recommend migrating to another image.**

This project is tested in both Travis and Taskcluster.

### Docs
See: https://docs.taskcluster.net/manual/vcs/github

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

### Deploying

This service will auto-deploy *to staging* in Heroku once merged into master
and CI runs are successful. If you need to force a deploy because we've broken
CI in some way and this urgently needs to be deployed, you can do it from the
[Heroku
console](https://dashboard-preview.heroku.com/apps/taskcluster-github/deploy/github).

Once the new version has been deployed to staging, you can verify it is working
with `npm run checkStaging`.  Note that you will need an active SSH key with
write access to https://github.com/taskcluster/taskcluster-github-testing to
run this check (but, no other credentials!)

After you confirm it works on stage, deploy to production with [the
pipeline](https://dashboard.heroku.com/pipelines/b867da9f-e443-4ddd-b8b1-2209532897b4).
