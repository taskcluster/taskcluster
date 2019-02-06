# AWS Provisioner Pulse Exchanges

##

Exchanges from the provisioner... more docs later



## AwsProvisionerEvents Client

```js
// Create AwsProvisionerEvents client instance with default exchangePrefix:
// exchange/taskcluster-aws-provisioner/v1/

const awsProvisionerEvents = new taskcluster.AwsProvisionerEvents(options);
```

## Exchanges in AwsProvisionerEvents Client

```js
// awsProvisionerEvents.workerTypeCreated :: routingKeyPattern -> Promise BindingInfo
awsProvisionerEvents.workerTypeCreated(routingKeyPattern)
```

```js
// awsProvisionerEvents.workerTypeUpdated :: routingKeyPattern -> Promise BindingInfo
awsProvisionerEvents.workerTypeUpdated(routingKeyPattern)
```

```js
// awsProvisionerEvents.workerTypeRemoved :: routingKeyPattern -> Promise BindingInfo
awsProvisionerEvents.workerTypeRemoved(routingKeyPattern)
```