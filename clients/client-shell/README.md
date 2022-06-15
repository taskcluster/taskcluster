# Taskcluster Client for Shell

[![Download](https://img.shields.io/badge/github-taskcluster-brightgreen)](https://github.com/taskcluster/taskcluster/releases)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

**A Taskcluster client library for the command line.**

This directory builds an executable, `taskcluster`, suitable for interacting
with Taskcluster from the comfort of you command-line and in simple shell
scripts.  It provides utilities ranging from direct calls to the specific API
endpoints to more complex and _practical_ tasks like listing and cancelling
scheduled runs.

### Installation

To install, Linux users should download the `taskcluster` binary for the latest release your
platform, run `chmod +x` and run it!

MacOS users run the following command:
```shell
curl -L https://github.com/taskcluster/taskcluster/releases/download/v44.16.3/taskcluster-darwin-amd64 --output taskcluster
```
This is to ensure the binary is not quarantined by MacOS.
You will need to `chmod +x` of
course.

 * [linux-amd64](https://github.com/taskcluster/taskcluster/releases/download/v44.16.3/taskcluster-linux-amd64)
 * [darwin-amd64](https://github.com/taskcluster/taskcluster/releases/download/v44.16.3/taskcluster-darwin-amd64)

## Usage

For a list of all commands run `taskcluster help`, detailed information about
each command is available with
`taskcluster help <command> [<sub-command> [...]]`. You can also use the `-h`
or `--help` parameter to get a command's help information.

For a general guide to using Taskcluster clients, see [Calling Taskcluster APIs](https://docs.taskcluster.net/docs/manual/using/api).

### Setup

Provide Taskcluster credentials to this tool with [environment variables](https://docs.taskcluster.net/docs/manual/design/env-vars).

At least `TASKCLUSTER_ROOT_URL` must be given.
For API calls that require authentication, additionally `TASKCLUSTER_CLIENT_ID`, `TASKCLUSTER_ACCESS_TOKEN`, and perhaps `TASKCLUSTER_CERTIFICATE` are also required.

The `taskcluster signin` command provides an easy method to get credentials for use with this tool
See below.

### Calling API Methods

To call an API method, use the `taskcluster api <service> <apiMethod>` subcommand.
Help for these commands is extensive and based on the reference documentation; try

```shell
taskcluster api --help
taskcluster api auth --help
taskcluster api auth createClient --help
```

Positional URL arguments are given on the command line, with query arguments
given with options (e.g., `--limit`).  Methods that expect a payload body will
read that body in JSON format from stdin.  Response bodies are written to
stdout in JSON, or to the destination file given by `-o`.

[`jq`](https://stedolan.github.io/jq/) is a useful tool for dealing with JSON
inputs and outputs.

### Getting Credentials

The `taskcluster signin` subcommand provides an easy way to get credentials encoded into environment variables via a browser session.

```shell
$ eval `taskcluster signin`
```

This will open a web browser to get credentials, then set the corresponding environment variables in your shell session.

You might make this easy to use with a shell function in ~/.bashrc:

```shell
tc-signin() { eval `taskcluster signin "${@}"`; }
```

It's common to pass a `--name` (to help you differentiate clients from one another) and one or more `--scope` arguments:

```shell
tc-signin --name smoketest --scope assume:project:taskcluster:smoketests
```

See the `taskcluster signin --help` output or [Calling Taskcluster APIs](https://docs.taskcluster.net/docs/manual/using/api) for more information.

### Handling Timestamps

The `taskcluster from-now` subcommand can be used to generate timestamps relative to the current time.  For example:

```shell
echo '{"expires": "'`taskcluster from-now 1 hour`'", ...}' | taskcluster api ..
```

### Generating SlugIDs

The `taskcluster slugid` subcommand can generate (and encode and decode) slugids.
To generate a nice slugid:

```shell
taskcluster slugid generate -n
```

### Task and Task Group Commands

The following higher-level commands can be useful in day-to-day operations.
This list may be incomplete; consult `taskcluster --help` for the full list.

* `taskcluster group cancel` - cancel a whole task group by taskGroupId.
* `taskcluster group list` - list tasks (taskId and label) in a task group
* `taskcluster group status` - show the status of a task group
* `taskcluster task artifacts` - get the name of the artifacts of a task.
* `taskcluster task cancel` - cancel a task.
* `taskcluster task complete` - completes a task.
* `taskcluster task def` - get the full definition of a task.
* `taskcluster task group` - get the taskGroupID of a task.
* `taskcluster task log` - streams the log until completion.
* `taskcluster task name` - get the name of a task.
* `taskcluster task rerun` - rerun a task.
* `taskcluster task retrigger` - re-trigger a task (new taskId, updated timestamps).
* `taskcluster task run` - create and schedule a task through a 'docker run'-like interface.
* `taskcluster task status` - get the status of a task.

## Compatibility

This library is co-versioned with Taskcluster itself.
That is, a client with version x.y.z contains API methods corresponding to Taskcluster version x.y.z.
Taskcluster is careful to maintain API compatibility, and guarantees it within a major version.
That means that any client with version x.* will work against any Taskcluster services at version x.*, and is very likely to work for many other major versions of the Taskcluster services.
Any incompatibilities are noted in the [Changelog](https://github.com/taskcluster/taskcluster/blob/main/CHANGELOG.md).

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
