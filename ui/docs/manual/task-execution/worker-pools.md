---
title: Worker Pools
order: 30
---

# Worker Pools

There are a few different reasons to create new Taskcluster worker pools:
 * worker configurations
 * security boundaries
 * cache boundaries
 * resource limits

Effective configuration of a Taskcluster deployment requires balancing these concerns.

## Worker Configurations

Different worker types may correspond to different system configurations. For
example, one worker type may execute tasks in a Windows environment, while
another executes tasks within an iOS application context. Thus adding a new platform
would require adding a new worker type to execute tasks on that platform.

## Security Boundaries

Worker types also provide a security boundary. Taskcluster's access control
model limits what can create a task for each worker type. This can control
access to workers with special powers, such as one that can upload binaries for
release. It can also serve to isolate tasks with different trust levels from
one another: if level 1 tasks use a different worker type from level 2, and if
worker instances of those two worker types are isolated from one another, then
any operating-system or worker vulnerability that might let two tasks on the
same host affect each other would not allow cross-contamination between the two
levels.

## Cache Boundaries

Worker types can provide cache boundaries. Many worker implementations cache
data for re-use on later tasks. Dividing tasks into worker types based on the
caches they use can increase the cache hit rate. For example, data analysis
tasks might benefit from being separated into one worker type per dataset, to
maximize the likelihood of a task using a cached dataset already present on the
worker.

## Resource Limits

Worker types can also control costs and capacity. If a worker type is
configured with a maximum resource allocation (for example, configured to run
at most ten instances), then regardless of the number of tasks submitted, it
cannot exceed that capacity. Yet identically configured workers of a different
worker type might have a substantially higher maximum capacity, but with scopes
limiting its use to a different set of users.
