---
title: Build Specs
order: 20
---

A *build spec* describes how to build a Taskcluster release.

# Definition

A build spec consists of a directory with some files in it.

## README.md

The build spec can optionally contain a README.md file describing its behavior and purpose.

## main.yml

This file specifies the list of services to build.
It also contains a version number, which will be used to ensure backward compatibility of future versions of the build spec.

It contains properties:

* `version`: 1
* `services`: an array of objects with
  * `name`: service name
  * `source`: git URL for the specific repo and revision to build, e.g., `https://github.com/taskcluster/taskcluster-hooks#v1.2.3`
* `config`: configuration:
  * `docker`:
    * `repositoryPrefix`: prefix for docker repository; the build process will append the service name to this to create the repository name.
