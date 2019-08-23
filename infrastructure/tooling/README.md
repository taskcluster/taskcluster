# Taskcluster Builder

This tool implements internal build and release tasks for Taskcluster.
In particular, it builds Taskcluster images (`yarn build`) and performs code generation (`yarn generate`).

# Usage

To run from the git repository, just use `yarn build` or `yarn generate` (in the root of the repository).
Both commands have `--help` output that describes the available options.

# Code Generation Process

The build process is implemented in `infrastructure/tooling/src/generate`, with individual generation tasks defined in `generators/`.
Generation uses [console-taskgraph](https://github.com/djmitche/console-taskgraph) to structure the process.
This package constructs a graph of tasks, based on dependencies between those tasks, and executes them in order.

Code generation is used to ensure that information spread across the repository is in agreement.
For example, it ensures that API definitions in each service match the service documentation and the client libraries.

A critical property of generation is that it produce deterministic output.
This ensure that a `yarn generate` run will not create spurious differences which must then be checked into the repository.

# Build Process

The build process is implemented in `infrastructure/tooling/src/build`.
Its ultimate result is a docker image capable of running any Taskcluster service.
The build process displays the name of this image on successful completion.

Note that builds are not deterministic.
Two builds of exactly the same source may produce artifacts with different hashes.
In practice, the results are similar enough that this is not an issue.

Like code generation, the build uses [console-taskgraph](https://github.com/djmitche/console-taskgraph) to structure the process.
Tasks are defined based on the contents of the repository.
Most of the actual work takes place in docker containers, mounting host directories as necessary.

## Built Image

The built image ("monoimage") can run any process of any service, based on a string passed to `docker run`.
For example, to run an instance of the `web` process in the `auth` service (supplying the necessary configuration as environment variables):

```shell
docker run -ti --rm -e PORT=80 -e .. <image> auth/web
```

To run an interactive shell in the image, use

```shell
docker run -ti --rm -e PORT=80 -e .. <image> bash
```

## Skipping Tasks

Each task is expected to skip (`utils.skip({..})`) if its outputs are already available.
This allows the build process to complete in just a few seconds when nothing has changed since the last run.

To make this tractable, a task's outputs are not to be modified by any other tasks.
This occasionally requires copying data that might otherwise be used in-place, but this is generally a small cost.
In particular, builds are never performed directly in repository clones; instead, the data is copied to a fresh directory first.

The `Stamp` class helps ensure this.
Its constructor takes a bit of information about the executing step, along with a sequence of inputs to the step.
Some of those inputs can be other Stamp instances.
It then provides `dirStamped `and `stampDir` methods to make it simple to identify a directory that is the product of those inputs.
It also provides a `hash` method to produce a short hash based on those inputs.
