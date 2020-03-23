# Worker Runner

This repository defines a utility for running workers.

It handles:

 - Getting Taskcluster credentials
 - Interacting with the [worker manager](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
 - Gathering configuration from various sources
 - Polling for interruptions of cloud instances (e.g., spot termination)

## Operation

In operation, this tool performs the following steps to determine the
parameters for a run of a worker:

 * Read the *runner* configuration (`<runnerConfig>`).
 * Load the given provider and ask it to add settings to the run.  This
   step provides
   * Taskcluster credentials for the worker,
   * worker identification information (worker pool, worker ID, etc.),
   * the location of the worker, and
   * worker configuration.
 * Using the Taskcluster credentials, load configuration from the secrets
   service.
 * Load support for the given worker implementation and ask it to add
   settings to the run.

With all of this complete, the run parameters are fully determined:

 * Taskcluster contact information (rootURL, credentials)
 * Worker identity
 * Metadata from the provider (useful for user debugging)
 * Configuration for the worker (see below for details)

The final step, then, is to start the worker with the derived configuration.
The worker is run as a subprocess, with a simple, text-based protocol between start-worker and the worker itself.
The protocol is defined in [protocol.md](protocol.md).
This protocol is used to communicate events such as an impending shutdown.

## Worker Configuration

Worker configuration comes from a number of sources; in order from lowest to
highest precedence, these are:

* The worker runner config file
* The configuration defined by the provider, if any
* Configuration stored in the secrets service

Providers can supply configuration to the worker via whatever means makes sense.
For example, an EC2 or GCP provider would read configuration from the instance's userData.

### Configuration from Runner Config

The runner configuration file is described in more detail in the "Usage" section below.
Its `workerConfig` property can contain arbitrary worker configuration values.
For example:

```yaml
provider: ..
worker: ..
workerConfig:
  shutdownMachineOnIdle:  true
```

Note that the deeply-nested format described in the next section is not available in the runner config file.

### Provider Configuration

Providers that interact with the worker-manager service can get configuration from that service.
That configuration formally has the form:

```yaml
<workerImplementation>:
  config:
    workerConfigValue: ...
  files:
    - ...
```

Where all fields are optional.
The `<workerImplementation>` is replaced with the worker implementation name, in camel case (`genericWorker`, `dockerWorker`, etc.)
The contents of `<workerImplementation>.config` are merged into the worker configuration.
Files are handled as described below.

For backward compatibility, configuration may be specified as a simple object with configuration properties at the top level.
Support for this form will be removed in future versions.

Putting all of this together, a worker pool definition for a generic-worker instance might contain:
```yaml
launchConfigs:
- ...
  workerConfig:
    genericWorker:
      config:
        shutdownMachineOnInternalError: true
```

### Secrets

Secrets are stored in the secrets service under a secret named
`worker-pool:<workerPoolId>`, in the format

```yaml
config:
  workerConfigValue: ...
files:
  - ...
```

Where `config` is an object that is merged directly into the worker config.

Two backward-compatibility measures exist:

1. A secret named `worker-type:<workerPoolId>` is also consulted, as used before [RFC#145](https://github.com/taskcluster/taskcluster-rfcs/blob/master/rfcs/0145-workerpoolid-taskqueueid.md) landed.
1. If a secret does not have properties `config` and `files`, then its top-level contents are assumed to be worker configuration, with no files.

### Files

Files can also be stored in the secrets service and in provider configuration, under the `files` properties described above.
These can be used to write (small) files to disk on the worker before it starts up.
For example:

```yaml
files:
  - content: U....x8j==
    description: Secret Data!
    encoding: base64
    format: zip
    path: 'C:\secrets'
```

This would unzip the zipfile represented by `content` at `C:\secrets`.

The only encoding supported is `base64`.
The formats supported are:

 * `file` -- the content is decoded and written to the file named by `path`
 * `zip` -- the content is treated as a ZIP archive and extracted at the directory named by `path`


# Usage

<!-- start-usage -->
This binary is configured to run at instance start up, getting a configuration
file as its argument.  It logs to its stdout.

```
start-worker <runnerConfig>
```

## Configuration

Configuration for worker-runner is in the form of a YAML file with
the following fields:

* `provider`: (required) information about the provider for this worker

  * `providerType`: (required) the worker-manager providerType responsible for
    this worker; this generally indicates the cloud the worker is running in,
    or 'static' for a non-cloud-based worker; see below.

* `worker`: (required) information about the worker being run

  * `implementation`: (required) the name of the worker implementation; see
    below.

* `workerConfig`: arbitrary data which forms the basics of the config passed to
  the worker; this will be merged with several other sources of configuration.
  Note that the nested `<workerImplementation>.config` structure is not allowed
  here.

* `logging`: configuration for where logs from this application and from the
  worker should be sent.  This defaults to the `stdio` logging implementation.

  * `implementation`: the name of the logging implementation; see below.

* `getSecrets`: if true (the default), then configuration is fetched from the
  secrets service and merged with the worker configuration.  This option is
  generally only used in testing.

* `cacheOverRestarts`: if set to a filename, then the runner state is written
  to this JSON file at startup.  On subsequent startups, if the file exists,
  then it is loaded and the worker started directly without consulting
  worker-manager or any other external resources.  This is useful for worker
  implementations that restart the system as part of their normal operation
  and expect to start up with the same config after a restart.

**NOTE** for Windows users: the configuration file must be a UNIX-style text file.
DOS-style newlines and encodings other than utf-8 are not supported.

## Providers

Providers configuration depends on the providerType:

### aws

The providerType "aws" is intended for workers provisioned with worker-manager
providers using providerType "aws".  It requires

```yaml
provider:
    providerType: aws
```

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: aws
* region
* availabilityZone

### azure

The providerType "azure" is intended for workers provisioned with worker-manager
providers using providerType "azure".  It requires

```yaml
provider:
    providerType: azure
```

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: azure
* region

### google

The providerType "google" is intended for workers provisioned with worker-manager
providers using providerType "google".  It requires

```yaml
provider:
    providerType: google
```

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: google
* region
* zone

### standalone

The providerType "standalone" is intended for workers that have all of their
configuration pre-loaded.  Such workers do not interact with the worker manager.
This is not a recommended configuration - prefer to use the static provider.

It requires the following properties be included explicitly in the runner
configuration:

```yaml
provider:
    providerType: standalone
    rootURL: ..  # note the Golang spelling with capitalized "URL"
    clientID: .. # ..and similarly capitalized ID
    accessToken: ..
    workerPoolID: ..
    workerGroup: ..
    workerID: ..
    # (optional) custom provider-metadata entries to be passed to worker
    providerMetadata: {prop: val, ..}
    # (optional) custom properties for TASKCLUSTER_WORKER_LOCATION
    # (values must be strings)
    workerLocation:  {prop: val, ..}
```

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: standalone

as well as any worker location values from the configuration.

### static

The providerType "static" is intended for workers provisioned with worker-manager
providers using providerType "static".  It requires

```yaml
provider:
    providerType: static
    rootURL: ..    # note the Golang spelling with capitalized "URL"
    providerID: .. # ..and similarly capitalized ID
    workerPoolID: ...
    workerGroup: ...
    workerID: ...
    staticSecret: ... # shared secret configured for this worker in worker-manager
    # (optional) custom provider-metadata entries to be passed to worker
    providerMetadata: {prop: val, ..}
    # (optional) custom properties for TASKCLUSTER_WORKER_LOCATION
    # (values must be strings)
    workerLocation:  {prop: val, ..}
```

The [$TASKCLUSTER_WORKER_LOCATION](https://docs.taskcluster.net/docs/manual/design/env-vars#taskcluster_worker_location)
defined by this provider has the following fields:

* cloud: static

as well as any worker location values from the configuration.


## Workers

The following worker implementations are supported:

### docker-worker

The "docker-worker" worker implementation starts docker-worker
(https://github.com/taskcluster/docker-worker).  It takes the following
values in the 'worker' section of the runner configuration:

```yaml
worker:
    implementation: docker-worker
    # path to the root of the docker-worker repo clone
    path: /path/to/docker-worker/repo
    # path where worker-runner should write the generated
    # docker-worker configuration.
    configPath: ..
```

### dummy

The "dummy" worker implementation does nothing but dump the state instead of
"starting" anything.  It is intended for debugging.

```yaml
worker:
    implementation: dummy
```

### generic-worker

The "generic-worker" worker implementation starts generic-worker
(https://github.com/taskcluster/generic-worker).  It takes the following
values in the 'worker' section of the runner configuration:

    worker:
        implementation: generic-worker
        # path to the root of the generic-worker executable
        # can also be a wrapper script to which args will be passed
        path: /usr/local/bin/generic-worker
        # (Windows only) service name to start
        service: "Generic Worker"
        # (Windows only) named pipe (\\.\pipe\<something>) with which generic-worker
        # will communicate with worker-runner; default value is as shown here:
        protocolPipe: \\.\pipe\generic-worker
        # path where worker-runner should write the generated
        # generic-worker configuration.
        configPath: /etc/taskcluster/generic-worker/config.yaml

Specify either 'path' to run the executable directly, or 'service' to name a
Windows service that will run the worker.  In the latter case, the configPath
must match the path configured within the service definition.  See
[windows-services](./docs/windows-services.md) for details.  Note that running
as a service requires at least generic-worker v16.6.0.


## Logging

The following logging implementations are supported:

### stdio

The "stdio" logging logs to stderr with a timestamp prefix.  It is the default
if no logging configuration is given.  It does not take any other properties.

    logging:
        implementation: stdio
<!-- end-usage -->

# Deployment

See [deployment](./docs/deployment.md) for advice on deploying worker-runner itself.

# Development

This application requires go1.13.
Test with `go test ./...`.
