Taskcluster
-----------
[![Task Status](https://github.taskcluster.net/v1/repository/taskcluster/taskcluster/master/badge.svg)](https://github.taskcluster.net/v1/repository/taskcluster/taskcluster/master/latest)

Taskcluster is the task execution framework that supports Mozilla's continuous integration and release processes.

## Repository Usage

This repository is used to develop, build, and release the Taskcluster services.
It is not possible to run a full Taskcluster deployment directly from this repository, although individual services can be run for development purposes.

### Setup

To set up the repository, run `yarn` in the root directory.
This will install all required dependencies from the Yarn registry.

### Build

To build the Taskcluster services, run `./taskcluster-builder build`.
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
