# Purge-Cache Exchanges

##

The purge-cache service, typically available at
`purge-cache.taskcluster.net`, is responsible for publishing a pulse
message for workers, so they can purge cache upon request.

This document describes the exchange offered for workers by the
cache-purge service.



## PurgeCacheEvents Client

```js
// Create PurgeCacheEvents client instance with default exchangePrefix:
// exchange/taskcluster-purge-cache/v1/

const purgeCacheEvents = new taskcluster.PurgeCacheEvents(options);
```

## Exchanges in PurgeCacheEvents Client

```js
// purgeCacheEvents.purgeCache :: routingKeyPattern -> Promise BindingInfo
purgeCacheEvents.purgeCache(routingKeyPattern)
```