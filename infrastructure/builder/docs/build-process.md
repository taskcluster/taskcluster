---
title: Installing Taskcluster
order: 10
---

Taskcluster installation breaks down into two phases:

 * Build a Taskcluster release
 * Deploy that release

# Build

The build phase takes a [build spec](./build-spec) and source code and, along with lots of external resources like docker images, third-party packages, and so on, and produces a "release".

The output of the build process is a [release](./release).
This contains references to the built artifacts as well as a copy of the build-time configuration.

# Deploy

The deploy phase takes a [release](./release) and a [deploy spec](./deploy-spec) and deploys Taskcluster as described in the deploy spec.
