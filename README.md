# Taskcluster Worker Runner

This repository defines a utility for running workers.

It will handle:

 - Getting Taskcluster credentials
 - Interacting with the worker manager
 - Gathering configuration from various sources
 - Workers which reboot as part of their handling of tasks
 - Managing autologin
 - Polling for changed deployment IDs and signalling to workers when they should stop

## Usage

<!-- start-usage -->
```
start-worker starts Taskcluster workers.

Usage:
	start-worker <runnerConfig>


Configuration is in the form of a YAML file with the following fields:

	provider: (required) information about the provider for this worker

		providerType: (required) the worker-manager providerType responsible for this worker;
			this generally indicates the cloud the worker is running in, or 'static' for a
			non-cloud-based worker; see below.

	worker: (required) information about the worker being run

		implementation: (required) the name of the worker implementation

	workerConfig: arbitrary data which forms the basics of the config passed to the worker;
		this will be merged with several other sources of configuration.



Providers configuration depends on the providerType:

The providerType "aws-provisioner" is intended for workers provisioned with
the legacy aws-provisioner application.  It requires 

	provider:
	    providerType: aws-provisioner


The providerType "standalone" is intended for workers that have all of their
configuration pre-loaded.  It requires the following properties be included
explicitly in the runner configuration:

	provider:
		providerType: standalone
		rootURL: ..
		clientID: ..
		accessToken: ..
		workerPoolID: ..
		workerGroup: ..
		workerID: ..



The following worker implementations are supported:


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



The "dummy" worker implementation does nothing but dump the run instead of
"starting" anything.  It is intended for debugging.
```
<!-- end-usage -->

## Operation

In operation, this tool performs the following steps to determine the
parameters for a run of a worker:

 * Read the *runner* configuration (`<runnerConfig>`).
 * Load the given provider and ask it to add settings to the run.  This
   step provides Taskcluster credentials for the worker, as well as
   identification information (worker pool, worker ID, etc.).
 * Using the Taskcluster credentials, load configuration from the secrets
   service with secret name `worker-type:<workerPoolId>`.
 * Load support for the given worker implementation and ask it to add
   settings to the run.

With all of this complete, the run parameters are fully determined:

 * Taskcluster contact information (rootURL, credentials)
 * Worker identity
 * Metadata from the provider (useful for user debugging)
 * Configuration for the worker

The final step, then, is to start the worker with the derived configuration.

# Development

This application requires go1.11.
Test with `go test ./...`.

## Releases

To make a new release, run `./release.sh <version>`.
Examine the resulting commit and tag for completeness, then push to the upstream repository.
