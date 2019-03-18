<h1 align="center">
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors)
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
* [Clients](clients#readme)
    * [Taskcluster Client](clients/client#readme)
    * [Taskcluster Client Web](clients/client-web#readme)
* [Infrastructure](infrastructure#readme)
    * [Browser-Test Docker Image](infrastructure/browser-test#readme)
    * [Taskcluster Builder](infrastructure/builder#readme)
    * [References](infrastructure/references#readme)
    * [Terraform](infrastructure/terraform#readme)
* [Libraries](libraries#readme)
    * [API Library](libraries/api#readme)
    * [App Library](libraries/app#readme)
    * [Azure Library](libraries/azure#readme)
    * [Config Library](libraries/config#readme)
    * [Docs Library](libraries/docs#readme)
    * [Iterate Library](libraries/iterate#readme)
    * [Loader Library](libraries/loader#readme)
    * [Monitor Library](libraries/monitor#readme)
    * [Pulse Library](libraries/pulse#readme)
    * [References Library](libraries/references#readme)
    * [Scopes Library](libraries/scopes#readme)
    * [Testing Library](libraries/testing#readme)
    * [Validate Library](libraries/validate#readme)
* [Services](services#readme)
    * [Auth Service](services/auth#readme)
    * [Built-In Workers Service](services/built-in-workers#readme)
    * [Github Service](services/github#readme)
    * [Hooks Service](services/hooks#readme)
    * [Index Service](services/index#readme)
    * [Login Service](services/login#readme)
    * [Notify Service](services/notify#readme)
    * [Purge-Cache Service](services/purge-cache#readme)
    * [Queue Service](services/queue#readme)
    * [Secrets Service](services/secrets#readme)
    * [Treeherder Service](services/treeherder#readme)
    * [Web-Server Service](services/web-server#readme)
    * [Worker Manager](services/worker-manager#readme)
* [Taskcluster Web](ui#readme)
    * [ui/src/components/DateDistance](ui/src/components/DateDistance#readme)
    * [ui/src/components/Search](ui/src/components/Search#readme)
    * [ui/src/components/Snackbar](ui/src/components/Snackbar#readme)
    * [ui/src/components/SpeedDial](ui/src/components/SpeedDial#readme)
    * [ui/src/components/StatusLabel](ui/src/components/StatusLabel#readme)
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

## Contributors

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore -->
<table><tr><td align="center"><a href="http://code.v.igoro.us/"><img src="https://avatars3.githubusercontent.com/u/28673?v=4" width="100px;" alt="Dustin J. Mitchell"/><br /><sub><b>Dustin J. Mitchell</b></sub></a><br /><a href="https://github.com/taskcluster/taskcluster/commits?author=djmitche" title="Code">💻</a></td></tr></table>

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification. Contributions of any kind welcome!