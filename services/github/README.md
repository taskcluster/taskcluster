TaskCluster GitHub Service
==========================
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-github.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-github)

This service monitors all of the repositories associated with an organization for changes and schedules TaskCluster tasks for any repository which contains a `.taskcluster.yml` configuration file. The goal of this project is to provide project owners a method for scheduling jobs in TaskCluster which is quick and straight forward.

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
First add pulse credentials to ``user-config.yml``. An example is available at ``user-config-example.yml``.
Then from the project's base run ``npm test``.

To test the components separately, run:
- server: `npm run compile && <set the environment variables> node lib/main.js server`
- handlers: `npm run compile && <set the environment variables> node lib/main.js worker`

In both travis and taskcluster, the env variables needed to run integration tests are added when pushing.

### Deploying
This service will auto-deploy *to staging* in Heroku once merged into master and CI runs are successful. If you need to force a deploy because we've broken CI in some way and this urgently needs to be deployed, you can do it from the [Heroku console](https://dashboard-preview.heroku.com/apps/taskcluster-github/deploy/github). Once the new version has been deployed, you can verify it is working by making a throw-away pull request into [our test project](https://github.com/TaskClusterRobot/hooks-testing). Ensure that at least [the staging user](https://github.com/taskclusterrobot-staging) has set the status. If it is tested and has the status updated by this service, it is working. After you confirm it works on stage, deploy to production with [the pipeline](https://dashboard.heroku.com/pipelines/b867da9f-e443-4ddd-b8b1-2209532897b4). To be safe, you can try the verification steps again, but this time [the real user](https://github.com/taskclusterrobot) should have set the status as well.
