# TaskCluster CLI Client

![Task Status](https://github.taskcluster.net/v1/badge/taskcluster/taskcluster-cli/master)

## Overview

TaskCluster CLI is a command-line client offering control and access to
taskcluster from the comfort of your command-line. It provides utilities
ranging from direct calls to the specific API endpoints to more complex and
_practical_ tasks like listing and cancelling scheduled runs.

## Usage

For a list of all commands run `taskcluster help`, detailed information about
each command is available with
`taskcluster help <command> [<sub-command> [...]]`. You can also use the `-h`
or `--help` parameter to get a command's help information.

### Installation

To install, download the `taskcluster` binary for the latest release your
platform, and run it!

 * [amd64](https://downloads.taskcluster.net/taskcluster-cli/latest/amd64/taskcluster) (note: you must chmod +x the result)


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

We are using [cobra](https://github.com/spf13/cobra) to manage the various
commands and sub-commands that are implemented in taskcluster-cli.

Each command is a instance of the `cobra.Command` struct, and is dynamically
registered at run-time in the command tree (in `func init() {...}`). Thus,
commands are registered as an import side-effect. Commands are implemented in
sub-packages.

To add a new command, create a new sub-package under `cmds` and add an import
for that sub-package to `subtree_import.go`, keeping the imports in order.
