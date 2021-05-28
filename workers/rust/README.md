# Rust Worker Support

This directory contains several crates for Taskcluster workers.

* [taskcluster-lib-worker](./lib-worker) - implements code common to all workers
* [container-worker](./container) - is a worker implementation that uses OCI containers to execute tasks

## TODO

### Taskcluster-Lib-Worker

* Support workerproto in Worker
  * Shutdown
  * Logging
  * Error reporting
* Loading configuration from a JSON file
* Resolve a task smoothly as Cancelled on a 409 from queue.reclaimTask
* Task logging
  * implement live-logging using websocktunnel (optionally, only if necessary config is provided)
* More artifact support
  * support for downloading artifacts
  * support for creating non-data artifacts

There appears to be a tokio bug, where the process does not exit when `main`
returns.  `container/src/bin/contaner-worker.rs` calls `std::process::exit(0)`
to work around this.

This may not be an issue once the workerproto "shutdown" support is
implemented, as that specifies a way for the worker to explicitly shut itself
down by sending a `shutdown` message to worker-runner and exiting.  That will
be a natural place to call `std::process:exit(0)`.

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
