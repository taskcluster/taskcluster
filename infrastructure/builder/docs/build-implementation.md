---
title: Build Implementation
order: 50
---

This section describes how the build process is implemented.
It is useful to anyone interested in modifying this process or buliding their own Taskcluster release.
It provides a high-level guide that should help in reading and understanding the associated source code.

# TaskGraph

The build process uses [console-taskgraph](https://github.com/djmitche/console-taskgraph) to structure the build process.
This package constructs a graph of tasks, based on dependencies between those tasks, and executes them in order.

Tasks are defined based on the build spec.
Broadly, a task is created to clone each repository, followed by a set of additional tasks depending on `repository.kind`.
A few additional utility tasks, such as to clone docker images, are added as needed.

## Skipping

Each task is expected to skip (`utils.skip({..})`) if its outputs are already available.
This allows the build process to complete in just a few seconds when nothing has changed since the last run.

To make this tractable, a task's outputs are not to be modified by any other tasks.
This occasionally requires copying data that might otherwise be used in-place, but this is generally a small cost.
In particular, builds are never performed directly in repository clones; instead, the data is copied to a fresh directory first.

The `Stamp` class helps ensure this.
Its constructor takes a bit of information about the executing step, along with a sequence of inputs to the step.
Some of those inputs can be other Stamp instances.
It then provides `dirStamped `and `stampDir` methods to make it simple to identify a directory that is the product of those inputs.
It also provides a `hash` method to produce a short hash based on those inputs.

## Dependencies

Dependency names follow some patterns:

* `repo-${name}-dir` -- the directory in which a repository has been checked out
* `repo-${name}-exact-source` -- the exact source URL for the repository
* `repo-${name}-stamp` -- the Stamp instance for this repository
* `docker-image-${image}` -- the named Docker image is available in the local Docker daemon
* `docs-${name}-dir` -- the directory containing documentation for the named repository; this will always be `${baseDir}/docs/${name}`, allowing mounting `${baseDir}/docs` in a docker image if necessary.
* `docs-${name}-stamp` -- the Stamp instance for the docs dir
* `service-${name}-stamp` -- the Stamp instance for the built service
* `service-${name}-docker-image` -- the built Docker image for the named service (used to create the Terraform-JSON output)
* `service-${name}-image-on-registry` -- true if the docker image for the named service is already present on the Docker registry
* `target-service-${name}` -- target dependency for the end-to-end build of the service (with optional push)
