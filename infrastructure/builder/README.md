Taskcluster Installer
=====================

This tool builds and deploys Taskcluster instances.

See the `docs/` directory for more details on how it does that.

# Usage

To install:

```
yarn global add taskcluster-installer
```

or, to run from the git repository, just use `./taskcluster-installer` as the command below.

## Build

To build a Taskcluster release, run

```
taskcluster-installer build <build-spec>
```

## Release

To make a release, run

```
taskcluster-installer release
```
