# AWS Provisioner API Documentation

##

The AWS Provisioner is responsible for provisioning instances on EC2 for use in
Taskcluster.  The provisioner maintains a set of worker configurations which
can be managed with an API that is typically available at
aws-provisioner.taskcluster.net/v1.  This API can also perform basic instance
management tasks in addition to maintaining the internal state of worker type
configuration information.

The Provisioner runs at a configurable interval.  Each iteration of the
provisioner fetches a current copy the state that the AWS EC2 api reports.  In
each iteration, we ask the Queue how many tasks are pending for that worker
type.  Based on the number of tasks pending and the scaling ratio, we may
submit requests for new instances.  We use pricing information, capacity and
utility factor information to decide which instance type in which region would
be the optimal configuration.

Each EC2 instance type will declare a capacity and utility factor.  Capacity is
the number of tasks that a given machine is capable of running concurrently.
Utility factor is a relative measure of performance between two instance types.
We multiply the utility factor by the spot price to compare instance types and
regions when making the bidding choices.

When a new EC2 instance is instantiated, its user data contains a token in
`securityToken` that can be used with the `getSecret` method to retrieve
the worker's credentials and any needed passwords or other restricted
information.  The worker is responsible for deleting the secret after
retrieving it, to prevent dissemination of the secret to other proceses
which can read the instance user data.


## AwsProvisioner Client

```js
// Create AwsProvisioner client instance:

const awsProvisioner = new taskcluster.AwsProvisioner(options);
```

## Methods in AwsProvisioner Client

```js
// awsProvisioner.listWorkerTypeSummaries :: () -> Promise Result
awsProvisioner.listWorkerTypeSummaries()
```

```js
// awsProvisioner.createWorkerType :: (workerType -> payload) -> Promise Result
awsProvisioner.createWorkerType(workerType, payload)
```

```js
// awsProvisioner.updateWorkerType :: (workerType -> payload) -> Promise Result
awsProvisioner.updateWorkerType(workerType, payload)
```

```js
// awsProvisioner.workerTypeLastModified :: workerType -> Promise Result
awsProvisioner.workerTypeLastModified(workerType)
```

```js
// awsProvisioner.workerType :: workerType -> Promise Result
awsProvisioner.workerType(workerType)
```

```js
// awsProvisioner.removeWorkerType :: workerType -> Promise Nothing
awsProvisioner.removeWorkerType(workerType)
```

```js
// awsProvisioner.listWorkerTypes :: () -> Promise Result
awsProvisioner.listWorkerTypes()
```

```js
// awsProvisioner.createSecret :: (token -> payload) -> Promise Nothing
awsProvisioner.createSecret(token, payload)
```

```js
// awsProvisioner.getSecret :: token -> Promise Result
awsProvisioner.getSecret(token)
```

```js
// awsProvisioner.instanceStarted :: (instanceId -> token) -> Promise Nothing
awsProvisioner.instanceStarted(instanceId, token)
```

```js
// awsProvisioner.removeSecret :: token -> Promise Nothing
awsProvisioner.removeSecret(token)
```

```js
// awsProvisioner.getLaunchSpecs :: workerType -> Promise Result
awsProvisioner.getLaunchSpecs(workerType)
```

```js
// awsProvisioner.state :: workerType -> Promise Nothing
awsProvisioner.state(workerType)
```

```js
// awsProvisioner.backendStatus :: () -> Promise Result
awsProvisioner.backendStatus()
```

```js
// awsProvisioner.ping :: () -> Promise Nothing
awsProvisioner.ping()
```

