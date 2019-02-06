# Taskcluster-treeherder Pulse Exchange

##

The taskcluster-treeherder service is responsible for processing
task events published by TaskCluster Queue and producing job messages
that are consumable by Treeherder.

This exchange provides that job messages to be consumed by any queue that
attached to the exchange.  This could be a production Treeheder instance,
a local development environment, or a custom dashboard.



## TreeherderEvents Client

```js
// Create TreeherderEvents client instance with default exchangePrefix:
// exchange/taskcluster-treeherder/v1/

const treeherderEvents = new taskcluster.TreeherderEvents(options);
```

## Exchanges in TreeherderEvents Client

```js
// treeherderEvents.jobs :: routingKeyPattern -> Promise BindingInfo
treeherderEvents.jobs(routingKeyPattern)
```