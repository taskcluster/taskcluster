# Rust Worker Support

This directory contains several crates for Taskcluster workers.

* [taskcluster-lib-worker](./lib-worker) - implements code common to all workers
* [container-worker](./container) - is a worker implementation that uses OCI containers to execute tasks

## TODO

### Taskcluster-Lib-Worker

* Support for the worker-runner protocol
  * Renewing worker credentials
  * Graceful shutdown
* Loading configuration from a JSON file
* Reclaiming tasks (in `taskcluster_lib_worker::execute`)
* Task logging
  * (optionally) implement live-logging using websocktunnel
* Artifact support
  * support for downloading artifacts
  * support for creating non-data artifacts

### container-worker

* duplicate all advertized docker-worker functionality, following docker-worker's payload schema
  * artifacts
  * env
  * caches
  * loading images from other tasks or the index
  * maxRunTime
  * onExitStatus
  * funky features and capabilities
  * ...
* build a trait-based abstraction around the container engine to allow using various OCI implementations (and to allow testing)
* testing (this was the downfall of docker-worker!)
