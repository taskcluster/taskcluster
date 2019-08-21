# Taskcluster Worker Runner

This repository defines a utility for running workers.

It handles:

 - Getting Taskcluster credentials
 - Interacting with the worker manager
 - Gathering configuration from various sources
 - Polling for interruptions of cloud instances (e.g., spot termination)

## Usage

<!-- start-usage -->
```
start-worker starts Taskcluster workers.

Usage:
	start-worker <runnerConfig>


## Configuration

Configuration for this process is in the form of a YAML file with the following fields:

	provider: (required) information about the provider for this worker

		providerType: (required) the worker-manager providerType responsible for this worker;
			this generally indicates the cloud the worker is running in, or 'static' for a
			non-cloud-based worker; see below.

	worker: (required) information about the worker being run

		implementation: (required) the name of the worker implementation; see below.

	workerConfig: arbitrary data which forms the basics of the config passed to the worker;
		this will be merged with several other sources of configuration.

	getSecrets: if true (the default), then configuration is fetched from the secrets service
		and merged with the worker configuration.  This option is generally only used in testing.

	cacheOverRestarts: if set to a filename, then the runner state is written
		to this JSON file at startup.  On subsequent startups, if the file exists,
		then it is loaded and the worker started directly without consulting
		worker-manager or any other external resources.  This is useful for worker
		implementations that restart the system as part of their normal operation
		and expect to start up with the same config after a restart.  

## Providers

Providers configuration depends on the providerType:

### aws-provisioner

The providerType "aws-provisioner" is intended for workers provisioned with
the legacy aws-provisioner application.  It requires 

	provider:
		providerType: aws-provisioner

### google

The providerType "google" is intended for workers provisioned with worker-manager
providers using providerType "google".  It requires

	provider:
		providerType: google

### standalone

The providerType "standalone" is intended for workers that have all of their
configuration pre-loaded.  Such workers do not interact with the worker manager.
This is not a recommended configuration - prefer to use the static provider.

It requires the following properties be included explicitly in the runner
configuration:

	provider:
		providerType: standalone
		rootURL: ..
		clientID: ..
		accessToken: ..
		workerPoolID: ..
		workerGroup: ..
		workerID: ..

### static

The providerType "static" is intended for workers provisioned with worker-manager
providers using providerType "static".  It requires

	provider:
		providerType: static
		rootURL: ...
		providerID: ...
		workerPoolID: ...
		workerGroup: ...
		workerID: ...
		staticSecret: ... // shared secret configured for this worker in worker-manager


## Workers

The following worker implementations are supported:

### docker-worker

The "docker-worker" worker implementation starts docker-worker
(https://github.com/taskcluster/docker-worker).  It takes the following
values in the 'worker' section of the runner configuration:

	worker:
		implementation: docker-worker
		# path to the root of the docker-worker repo clone
		path: /path/to/docker-worker/repo
		# path where taskcluster-worker-runner should write the generated
		# docker-worker configuration.
		configPath: ..

### dummy

The "dummy" worker implementation does nothing but dump the state instead of
"starting" anything.  It is intended for debugging.
```
<!-- end-usage -->

## Worker Configuration

Worker configuration comes from a number of sources; in order from lowest to
highest precedence, these are:

* The worker runner config file (described above)
* The configuration defined by the provider, if any
* Configuration stored in the secrets service

Providers can supply configuration to the worker via whatever means makes sense.
For example, an EC2 or GCP provider would read configuration from the instance's userData.

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

Files can also be stored in the secrets service, under the `files` property described above.
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

## Operation

In operation, this tool performs the following steps to determine the
parameters for a run of a worker:

 * Read the *runner* configuration (`<runnerConfig>`).
 * Load the given provider and ask it to add settings to the run.  This
   step provides Taskcluster credentials for the worker, as well as
   identification information (worker pool, worker ID, etc.) and more worker
   configuration.
 * Using the Taskcluster credentials, load configuration from the secrets
   service.
 * Load support for the given worker implementation and ask it to add
   settings to the run.

With all of this complete, the run parameters are fully determined:

 * Taskcluster contact information (rootURL, credentials)
 * Worker identity
 * Metadata from the provider (useful for user debugging)
 * Configuration for the worker

The final step, then, is to start the worker with the derived configuration.

## Protocol

This application defines a simple, text-based protocol between start-worker and the worker itself.
The protocol is defined in [protocol.md](protocol.md).

# Development

This application requires go1.12.
Test with `go test ./...`.

## Releases

To make a new release, run `./release.sh <version>`.
Examine the resulting commit and tag for completeness, then push to the upstream repository.
