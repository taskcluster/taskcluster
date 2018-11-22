---
filename: tasks/artifacts.md
title: Artifacts
order: 35
---

By far the most commonly used data from a run are its artifacts. These are
HTTP entities containing output data from the task execution.

Unlike most API methods which return a JSON body, requesting an artifact from
the Queue service returns the artifact itself, possibly via one or more HTTP
redirects. This means that -- at least for public artifacts which require no
authentication -- any sufficiently robust HTTP client can download an artifact
directly.

**NOTE**: Not all clients are "sufficiently robust"! The artifact interface
makes heavy use of redirects, and artifacts may make use of other web-standard
features such as content encoding.  Like any distributed system, requests may
fail, too, and a robust client should retry. Out of the box, `curl` and `wget`
do not handle most of these cases.

Taskcluster's Queue service supports a number of artifact types, including
several cloud data-storage back-ends as well as two special types: errors and
references. Error artifacts will always return an HTTP 403 (Forbidden), with
message and details supplied by the task. Reference artifacts return a 303 (See
Other) redirecting the client to another URL.

## Public and Private Artifacts

While it is possible to create artifacts which require authorization to
download, most artifacts are public. These are easily identified by the prefix
`public/` in the artifact name. All other artifacts are private, and
authorization will be required to read them.

That authorization is by artifact name, not by task. So a particular user with
access to artifacts named `projects/mrsfields/cookie-recipe.md` can access such
an artifact on any task - whether that task is related to the `mrsfields`
project or not.

## Log Artifacts

By convention, workers record the output of a task -- a command's output to
stdout and stderr, for example -- in an artifact named `public/logs/live.log`.  The
details of this artifact, such as its storage type and encoding, can differ
from worker to worker. You should not assume anything about it, as the
implementation may change dynamically to optimize performance.

While a task is running, some workers can relay data to the client as it is
produced, in a single HTTP request. Clients can parse and display this data as
it arrives to present a "live log" to the user.