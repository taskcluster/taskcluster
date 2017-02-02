# TaskCluster CLI Client

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-cli.svg)](https://travis-ci.org/taskcluster/taskcluster-cli)

## Overview

TaskCluster CLI is a command-line client offering control and access to
taskcluster from the comfort of your command-line. It provides utilities
ranging from direct calls to the specific API endpoints to more complex and
_practical_ tasks like listing and cancelling scheduled runs.

## Usage

For a list of all commands run `taskcluster help`, detailed information about
each command is available with `taskcluster help <command>`. Some commands may
even specify additional help for sub-commands using `taskcluster <command> help
<subcommand>`, refer to the individual commands' help text for details.

### Installation

To install, download the `taskcluster` binary for your platform from the latest
release on [the releases page](https://github.com/taskcluster/taskcluster-cli/releases).

## Development

### Building

Getting the source is as simple as running the following command in your shell.
Go will download the source and set up the repository in your `$GOPATH`.

```
go get -d github.com/taskcluster/taskcluster-cli
```

To actually build the application, simply run `make` in
`$GOPATH/github.com/taskcluster/taskcluster-cli` which will generate the
executable `taskcluster` in the root of the source.

### Dependency vendoring

The dependencies are managed through the
[govendor](https://github.com/kardianos/govendor) tool, but its use should be
transparent when building the project. After cloning the project, running
`govendor sync` will download the various dependencies and ensure that they
are at the version specified in the _vendor/vendor.json_ file, so that
everyone uses the same dependencies at the same version. The `make` process
automatically runs that command before building.

To add a new dependency to the project, simply run
`govendor fetch <go-import-url>` to add it to the list of dependencies. To
update all dependencies to their latest version, run `govendor fetch`. More
commands are described on the govendor project page.

### APIs

The API-related commands (`apis/`) are generated from the TaskCluster reference
data.  When that data changes, the commands can be updated automatically:

```
go get github.com/taskcluster/go-got  # only needed the first time
go generate ./apis
```

### Commands

A command is just an implementation of the `CommandProvider` interface, which
is registered in `func init() {...}` using `extpoints.Register(name,
implememtation)`. Thus, commands are registered as an import side-effect.
Commands are implemented in sub-packages.

To add a new command, create a new sub-package and add an import for that
sub-package to `subtree_import.go`, keeping the imports in order.
