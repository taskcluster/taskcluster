Taskcluster Purge Worker Cache Service
======================================

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-purge-cache.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-purge-cache)

Many taskcluster workers implements some generic form cache folders.
These cache often have a `name` that identifies them, for example a task
that builds code may have a cache folder called `master-object-directory` which
stores object directory for the master branch. Note, your organization maybe
have different naming scheme.

The idea with this service is to publish a message to a pulse exchange with
routing-key `<provisionerId>.<workerType>` carrying a message:
```js
{
  cacheName: '<cacheName>'
}
```
Then workers should listen for this message and purge caches of all kinds
matching the given `<cacheName>`.

This makes it easy to blow away poisoned caches should this ever be necessary.

Service Owner
-------------

Service Owner: jonasfj@mozilla.com

Deployment
----------
1) Supply configuration needed to run post-deploy verification tests. Example is in `user-config-example.yml`.
2) Merge branch with master and push to origin. Heroku will automatically deploy.
3) Once the new branch is deployed to Heroku, open [the pulse inspector](https://tools.taskcluster.net/pulse-inspector?bindings%5B0%5D%5Bexchange%5D=exchange%2Ftaskcluster-purge-cache%2Fv1%2Fpurge-cache&bindings%5B0%5D%5BroutingKeyPattern%5D=%23) and start listening.
4) Open https://tools.taskcluster.net/purge-caches.
5) Run `yarn verify` and ensure that a message shows up in the pulse inspector and in the tools site.
