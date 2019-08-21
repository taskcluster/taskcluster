# Taskcluster Shell Client

## Overview

Taskcluster Shell Client is a command-line client offering control and access to
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
platform, and run it!  On POSIX platforms you will need to `chmod +x` of
course.

 * [linux-amd64](https://github.com/taskcluster/taskcluster/releases/download/v16.2.0/taskcluster-linux-amd64)
 * [darwin-amd64](https://github.com/taskcluster/taskcluster/releases/download/v16.2.0/taskcluster-darwin-amd64)

## Development

### Requirements

This package requires Go version 1.12 and uses Go Modules.

### Building

To build the client, clone the Taskcluster repository, switch to the `clients/client-shell` directory, and run `go build -o taskcluster .`.

### Code Generation

The API specifications are generated automatically as part of running `yarn generate` in the root directory of this repository.

### Commands

We are using [cobra](https://github.com/spf13/cobra) to manage the various
commands and sub-commands that are implemented in taskcluster-cli.

Each command is a instance of the `cobra.Command` struct, and is dynamically
registered at run-time in the command tree (in `func init() {...}`). Thus,
commands are registered as an import side-effect. Commands are implemented in
sub-packages.

To add a new command, create a new sub-package under `cmds` and add an import
for that sub-package to `subtree_import.go`, keeping the imports in order.
