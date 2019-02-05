<h1 align="center">
  <br>
  <img src="https://media.taskcluster.net/logo/logo.png" alt="Taskcluster" width="80">
  <br>
  Taskcluster
  <br>
</h1>

<h5 align="center">The task execution framework that supports Mozilla's continuous integration and release processes.</h5>

<p align="center">
  <a href="https://github.taskcluster.net/v1/repository/taskcluster/taskcluster/master/latest">
    <img src="https://github.taskcluster.net/v1/repository/taskcluster/taskcluster/master/badge.svg" alt="Task Status">
  </a>
  <a href="http://mozilla.org/MPL/2.0">
    <img src="https://img.shields.io/badge/license-MPL%202.0-orange.svg" alt="License">
  </a>
  <a href="https://www.irccloud.com/invite?channel=%23taskcluster&amp;hostname=irc.mozilla.org&amp;port=6697&amp;ssl=1" target="_blank">
    <img src="https://img.shields.io/badge/IRC-%23taskcluster-1e72ff.svg?style=flat"  height="20">
  </a>
</p>

<hr/>

## Usage

This repository is used to develop, build, and release the Taskcluster services.
It is not possible to run a full Taskcluster deployment directly from this repository, although individual services can be run for development purposes.

## Table of Contents

<!-- TOC BEGIN -->
* [Infrastructure](infrastructure)
    * [References](infrastructure/references)
    * [Terraform](infrastructure/terraform)
    * [Taskcluster Builder](infrastructure/builder)
* [Libraries](libraries)
    * [Typed-Env-Config Library](libraries/typed-env-config)
    * [References Library](libraries/references)
    * [Validate Library](libraries/validate)
    * [Testing Library](libraries/testing)
    * [Iterate Library](libraries/iterate)
    * [Monitor Library](libraries/monitor)
    * [Scopes Library](libraries/scopes)
    * [Taskcluster Client](libraries/client)
    * [Loader Library](libraries/loader)
    * [Azure Library](libraries/azure)
    * [Pulse Library](libraries/pulse)
    * [Docs Library](libraries/docs)
    * [API Library](libraries/api)
    * [App Library](libraries/app)
* [Services](services)
    * [Built-In Workers Service](services/built-in-workers)
    * [Purge-Cache Service](services/purge-cache)
    * [Web-Server Service](services/web-server)
    * [Treeherder Service](services/treeherder)
    * [Secrets Service](services/secrets)
    * [Notify Service](services/notify)
    * [Github Service](services/github)
    * [Queue Service](services/queue)
    * [Login Service](services/login)
    * [Index Service](services/index)
    * [Hooks Service](services/hooks)
    * [Auth Service](services/auth)
* [Taskcluster Web](ui)
    * [ui/src/components/DateDistance](ui/src/components/DateDistance)
    * [ui/src/components/StatusLabel](ui/src/components/StatusLabel)
    * [ui/src/components/SpeedDial](ui/src/components/SpeedDial)
    * [ui/src/components/Snackbar](ui/src/components/Snackbar)
    * [ui/src/components/Markdown](ui/src/components/Markdown)
    * [ui/src/components/Search](ui/src/components/Search)
<!-- TOC END -->

### Setup

To set up the repository, run `yarn` in the root directory.
This will install all required dependencies from the Yarn registry.

### Test

To run tests for a specific package, you can either cd into the directory and `yarn test` from there or run `yarn workspace <package name> test` from the root.

### Build

To build the Taskcluster services, run `yarn build`.
The configuration for this command is in `build-config.yml`, and can be overridden with `user-build-config.yml` as necessary.
See `build-config.yml` for advice on what to override.

## Team Mentions

Do you need to reach a specific subset of the team? Use the team handles to mention us with GitHub's @mention feature.

| Team Name | Use To... |
| --------- | --------- |
| `@taskcluster/Core` | ping members of the Taskcluster team at Mozilla |
| `@taskcluster/services-reviewers` | ping reviewers for changes to platform services and libraries  |
| `@taskcluster/frontend-reviewers` | ping people who can review changes to frontend (and related) code in the services monorepo |
| `@taskcluster/security-folks` | ping people who do security things |
