---
title: Caching on Workers
order: 65
---

As discussed elsewhere, Taskcluster supports a broad array of workers, including workers you implement yourself.
So it's difficult to say anything about "all" workers, but the general-purpose workers that the Taskcluster team maintains do have some common functionality, including the ability to cache data between task executions.

## Caches

Caches are named directories stored on-disk on a worker.
They can be "mounted" at arbitrary locations within the image of an executing task.
A cache can only be used by one task at a time.

Caches are typically used for shared data sources such as version-control repositories or package installer caches.
Their use can result in a dramatic increase in task efficiency.

Caches can be of arbitrary size (limited by the disk space available on the worker itself), but can be garbage-collected by the worker implementation between tasks, if necessary.
Caching is most effective when "most" of the tasks executing on a worker use the same caches.
Too great a variety of caches results in frequent garbage collection and a low hit rate.
As such, caches aren't terribly useful on shared workerTypes such as `github-worker`.

## Configuration

The configuration of caches differs substantially between worker implementations.

Docker-worker configures caches in the [`cache` property of its payload](/docs/reference/workers/docker-worker/docs/caches).

Generic-worker uses the [`mounts` property](/docs/reference/workers/generic-worker/docs/payload).
Note that generic-worker has the capability to pre-fill a cache before task execution begins, and to mount such caches read-only.
