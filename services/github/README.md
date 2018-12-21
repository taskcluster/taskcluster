TaskCluster GitHub Service
==========================
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-github.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-github)

This service monitors all of the repositories associated with an organization for changes and schedules TaskCluster tasks for any repository which contains a `.taskcluster.yml` configuration file. The goal of this project is to provide project owners a method for scheduling jobs in TaskCluster which is quick and straight forward.

This project is tested in both Travis and Taskcluster.

###Docs
See: https://docs.taskcluster.net/manual/vcs/github

##Components

### API Server
Listens for WebHooks and, if they are valid, forwards them to a pulse exchange.

### Worker
Listens for WebHook triggered pulse messages and attempts to schedule TaskCluster tasks for any events related to a repository which contains a `.taskcluster.yml` file.

##Contributing

###Run Tests
From the project's base run ``npm test``
*note:* Initially, this will only run unit tests. To run integration tests add pulse credentals to ``user-config.yml``. An example is available at ``user-config-example.yml``.
