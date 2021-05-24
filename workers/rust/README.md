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
  * ExecutionContext should have some easy-to-use object for writing logs, including connecting a Stream of strings or bytes
  * That object should (optionally) implement live-logging use websocktunnel
* Artifact support
  * ExecutionContext should have an easy way to upload stuff as artifacts
* Testing support
  * Provide traits for various pieces (queue, logging, artifact support) and provide fake versions
  * It should be easy to run an Executor in a one-shot fashion with a fake task, fake queue, fake artifacts, etc.

### container-worker

* duplicate all advertized docker-worker functionality, following docker-worker's payload schema
  * artifacts
  * caches
  * loading images from other tasks or the index
  * maxRunTime
  * onExitStatus
  * funky features and capabilities
  * ...
* testing (this was the downfall of docker-worker!)
