TaskCluster Purge Worker Cache Service
======================================

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