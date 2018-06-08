# EC2 Instance Manager

##

A taskcluster service which manages EC2 instances.  This service does not understand any taskcluster concepts intrinsicaly other than using the name `workerType` to refer to a group of associated instances.  Unless you are working on building a provisioner for AWS, you almost certainly do not want to use this service

## EC2Manager Client

```js
// Create EC2Manager client instance:

const eC2Manager = new taskcluster.EC2Manager(options);
```

## Methods in EC2Manager Client

```js
// eC2Manager.listWorkerTypes :: () -> Promise Result
eC2Manager.listWorkerTypes()
```

```js
// eC2Manager.runInstance :: (workerType -> payload) -> Promise Nothing
eC2Manager.runInstance(workerType, payload)
```

```js
// eC2Manager.terminateWorkerType :: workerType -> Promise Nothing
eC2Manager.terminateWorkerType(workerType)
```

```js
// eC2Manager.workerTypeStats :: workerType -> Promise Result
eC2Manager.workerTypeStats(workerType)
```

```js
// eC2Manager.workerTypeHealth :: workerType -> Promise Result
eC2Manager.workerTypeHealth(workerType)
```

```js
// eC2Manager.workerTypeErrors :: workerType -> Promise Result
eC2Manager.workerTypeErrors(workerType)
```

```js
// eC2Manager.workerTypeState :: workerType -> Promise Result
eC2Manager.workerTypeState(workerType)
```

```js
// eC2Manager.ensureKeyPair :: (name -> payload) -> Promise Nothing
eC2Manager.ensureKeyPair(name, payload)
```

```js
// eC2Manager.removeKeyPair :: name -> Promise Nothing
eC2Manager.removeKeyPair(name)
```

```js
// eC2Manager.terminateInstance :: (region -> instanceId) -> Promise Nothing
eC2Manager.terminateInstance(region, instanceId)
```

```js
// eC2Manager.getPrices :: () -> Promise Result
eC2Manager.getPrices()
```

```js
// eC2Manager.getSpecificPrices :: payload -> Promise Result
eC2Manager.getSpecificPrices(payload)
```

```js
// eC2Manager.getHealth :: () -> Promise Result
eC2Manager.getHealth()
```

```js
// eC2Manager.getRecentErrors :: () -> Promise Result
eC2Manager.getRecentErrors()
```

```js
// eC2Manager.regions :: () -> Promise Nothing
eC2Manager.regions()
```

```js
// eC2Manager.amiUsage :: () -> Promise Nothing
eC2Manager.amiUsage()
```

```js
// eC2Manager.ebsUsage :: () -> Promise Nothing
eC2Manager.ebsUsage()
```

```js
// eC2Manager.dbpoolStats :: () -> Promise Nothing
eC2Manager.dbpoolStats()
```

```js
// eC2Manager.allState :: () -> Promise Nothing
eC2Manager.allState()
```

```js
// eC2Manager.sqsStats :: () -> Promise Nothing
eC2Manager.sqsStats()
```

```js
// eC2Manager.purgeQueues :: () -> Promise Nothing
eC2Manager.purgeQueues()
```

```js
// eC2Manager.apiReference :: () -> Promise Nothing
eC2Manager.apiReference()
```

```js
// eC2Manager.ping :: () -> Promise Nothing
eC2Manager.ping()
```

