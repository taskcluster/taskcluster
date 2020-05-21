# Providers

Providers are implemented as subclasses of `Provider` in `services/worker-manager/src/providers`, with their `providerType` defined in `index.js` in that directory.

## Operation

### Setup

At start-up, the service reads the set of defined providers and creates a class instance for each one.
The class constructor should set instance properties, but should not do anything that can fail, as such a failure would cause the process to exit, preventing other providers from operating.

The async `setup` method is called after the constructor, and can be used to perform more sophisticated setup operations.
No other methods will be called until `setup` has completed.
This is a good choice for setting up resources that are global to this provider, such as cloud-provider resources.

Note that this method is called once per *provider*, and thus may be called multiple times in the same process for a provider type.
It is also called in every worker-manager process as the process starts up; this often occurs simultaneously for several processes.
For example, a user might configure two providers with provider type `google`, and the `setup` methods for those providers will run simultaneously.
The method should be designed carefully to be idempotent and, if possible, to include the `providerId` in any named resources it manages.

## API Access

The `web` processes that run the API server maintain an active set of providers.

### Validating Config

Whenever a worker pool configuration is created or modified, the API method calls the relevant provider's `validate` method, passing the configuration object.
The default implementation of this method validates the configuration against the JSON schema named in `this.configSchema`.
The method returns null if everything is fine and an error message if not.

### Managing Workers

The worker-manager API exposes several worker-related methods, and these methods call out to the appropriate provider after performing some basic checks.
In each of these call-outs, the called method can throw an `ApiError` to generate a 400 response to the user containing the `message` from the error.
Any other error will result in a 500 error response and an error reported via taskcluster-lib-monitor.

#### Creating and Removing

The `createWorker` and `removeWorker` API methods allow users to create or destroy individual workers.
Precisely what this means differs from provider to provider.
Some providers may prohibit these operations entirely, while others (such as the static provider type) may require users to explicitly manage all workers.
In some cases, `removeWorker` may be interpreted as a request to terminate a dynamically-created worker in a cloud provider.

The provider's `createWorker` method is called with `workerPool` (an instance of the WorkerPool Azure entity class), `workerGroup`, `workerId`, and `input`.
The `input` matches the `create-worker-request.yml` schema, and that schema can be adjusted to allow provider-specific parameters.
The return value should be an instance of the Worker azure entity class.
[Idempotency](../../dev-docs/idempotency.md) of this method is the responsibilty of the provider.

The provider's `removeWorker` method is called with an instance of the Worker Azure entity class and a reason.
There are no restrictions on the state of that instance on return: it may still exist, and even have state RUNNING.

#### Registering

The provider's `registerWorker` method is called as a part of `registerWorker`, given both the WorkerPool and Worker instances, as well as the `workerIdentityProof` from the API request.
The API method first verifies that the given worker exists in the Azure table and that its worker pool and provider ID match.

The provider should verify the supplied identity proof and, if it is valid, modify the worker entry as appropriate (at least setting its state to RUNNING).
Providers that wish to limit registration to once per worker should return an error message from this function if the worker is already RUNNING.
A successful return value should be an object with property `expires` giving the appropriate expiration time for the resulting credentials.
If the method returns sucessfully, then the caller will be given Taskcluster credentials appropriate to the worker.

This API method is not scope-protected, and implements an access-control mechanism based on the identity proof.
It should be written with defensive programming in mind.
Check all inputs carefully and reject the request if anything is incorrect.
Do not reveal any information to a potential attacker in error messages -- avoid even indicating what portion of the input is incorrect (to prevent guessing attacks).

### Provider Data

Each worker entry has a `providerData` property which can be used to store arbitrary data about the worker.
The format of this object is entirely at the discretion of the provider.
Note that Azure entities have a fixed maximum size, so it is best to avoid storing any data in this property that grows without bound.

## Provisioning

The worker-manager runs a single "provisioner" process that runs the provisioning loop, where new workers are created to execute queued tasks.
In each iteration of this loop, each provider is responsible for determining how many instances to start, and starting them.

### Provisioning Workers

The provisioning process begins by calling each provider's `initiate` method.
This is similar to `setup`, but is not called in the web service.

Similarly, when the provisioning process stops cleanly, it calls each provider's `terminate` method.
Of course, clean stops are not the norm -- typically the process runs continuously until it crashes or is terminated -- so providers should not rely on `terminate` to clean up resources in production.
It is, however, useful in testing.

After calling `initiate`, the provisioner process enters a provisioning loop.
Each iteration begins by calling `prepare()` for every provider.
It then calls `provision({workerPool, workerInfo})` or `deprovision({workerPool})` for each worker pool.
Finally, it calls `cleanup()` for every provider.

the `provision` method is responsible for measuring demand (such as by examining the number of pending tasks) and starting any workers required.
It is called on the current provider for each worker pool.

The `deprovision` method is called for any *previous* providers for a worker pool.
Providers can take this opportunity to terminate any running workers, or simply do nothing and wait for those workers to terminate themselves.

### Managing Worker-Pool Resources

Providers may manage worker-pool-specific resources.
For example, a provider for a cloud might isolate workers for each worker pool in a dedicated network.
Such resources should be named after the `workerPoolId`.

When a new worker pool is created, or a worker pool's provider ID is changed, the provider's `createResources` method is called.
When a worker pool is modified, its provider's `updateResources` method is called.
When a previous provider for a worker pool no longer has any running workers, its `removeResources` method is called.

Each WorkerPool entity has a `providerData` property.
This property is shared among all providers, so each provider should use a sub-object named after the `providerId`.
Thus data should be accessed as `workerPool.providerData[this.providerId].propName`.

## Background Jobs

The worker-manager service runs a background job to scan existing workers for state changes.
This occurs frequently, in a loop.
Each iteration begins by calling `scanPrepare()` for each provider.
Then, for each worker that is not STOPPED, `provider.checkWorker({worker})` is called.
Finally, it calls `scanCleanup()` for each provider.
