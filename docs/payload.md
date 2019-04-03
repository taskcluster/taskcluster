---
title:        Payload Format
layout:       default
class:        html
docson:       true
marked:       true
ejs:          true
superagent:   true
docref:       true
order:        1
---

When submitting a task to the Taskcluster Queue (see
[createTask](/reference/platform/queue/reference/api-docs#createTask)) you must
provide a payload property for the task. This `payload` property is specific to
the worker implementation, and tells the worker what to execute, and which
artifacts to upload. This page documents the payload property for
generic-worker, on all the platforms that it is supported on.

* [Windows](#generic-worker-on-windows-native-engine)
* [macOS](#generic-worker-on-macos-native-engine)
* [Linux (docker engine)](#generic-worker-on-linux-docker-engine)
* [Linux (native engine)](#generic-worker-on-linux-native-engine)


# Generic Worker on Windows (native engine)

<div data-render-schema="https://schemas.taskcluster.net/generic-worker/v1/native-windows.json"></div>

# Generic Worker on macOS (native engine)

<div data-render-schema="https://schemas.taskcluster.net/generic-worker/v1/native-darwin.json"></div>

# Generic Worker on Linux (docker engine)

<div data-render-schema="https://schemas.taskcluster.net/generic-worker/v1/docker-linux.json"></div>

# Generic Worker on Linux (native engine)

<div data-render-schema="https://schemas.taskcluster.net/generic-worker/v1/native-linux.json"></div>

The payload comprises of a command to run, environment variables to be set
(optionally encrypted) and a timeout for the task (`maxRunTime`).

The worker will run the task, upload log files, and report back status to the
Queue.
