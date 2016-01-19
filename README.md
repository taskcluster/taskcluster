# taskcluster-proxy
<img hspace="20" align="left" src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-proxy.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-proxy)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-proxy?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-proxy)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-proxy/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-proxy?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

This is the proxy server which is used in the docker-worker which allows
individual tasks to talk to various taskcluster services (auth, queue,
scheduler) without hardcoding credentials into the containers themselves.

There are two ways of passing credentials; either via command line options, or
via environment variables.

**In production command line options should be used, since environment variables get injected into every linked container.**

### Credentials via Command Line Options

```bash
$ taskcluster-proxy --help
Taskcluster authentication proxy. By default this pulls all scopes from a
particular task but additional scopes may be added by specifying them after the
task id.

  Usage:
    taskcluster-proxy [options] <taskId> [<scope>...]
    taskcluster-proxy --help

  Options:
    -h --help                       Show this help screen.
    --version                       Show the taskcluster-proxy version number.
    -p --port <port>                Port to bind the proxy server to [default: 8080].
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
```

### Credentials via Environment Variables

Credentials may also be passed using environment variables:

* `TASKCLUSTER_CLIENT_ID`
* `TASKCLUSTER_ACCESS_TOKEN`
* `TASKCLUSTER_CERITIFICATE` (when using temporary credentials)

As noted above, please do not use these environment variables in production,
instead use command line options as described above.

## Examples

For simplicity the below examples use localhost in general this is nicest when
used with the docker and linking the `taskcluster/proxy` image into it.

```sh
# Start the server note that 2sz... is the task id
taskcluster-proxy 2szAy1JzSr6pyjVCdiTcoQ -p 60024
```

#### Fetch a task

```sh
curl localhost:60024/v1/task/2szAy1JzSr6pyjVCdiTcoQ
```

#### Create a signed url for the given task (bewit)

(Note task endpoint is public purely for demonstration)

```sh
# Returned url will last one hour
curl localhost:60024/bewit --data 'https://queue.taskcluster.net/v1/task/2szAy1JzSr6pyjVCdiTcoQ'
```

## Deployment

The proxy server can be deployed directly by building `proxy/main.go`
but the prefered method is via the `./build.sh` script which will
compile the proxy server for linux/amd64 and deploy the server to a
docker image.

```sh
./build.sh user/taskcluster-proxy-server
```

## Download and install via `go get`

```sh
go get github.com/taskcluster/taskcluster-proxy
```

## Tests

To run the full test suites you need taskcluster credentials with at least the
following scopes:

  * `auth:azure-table-access:fakeaccount/DuMmYtAbLe`
  * `queue:get-artifact:private/build/sources.xml`

The credentials are expected to be in the `TASKCLUSTER_CLIENT_ID` and
`TASKCLUSTER_ACCESS_TOKEN` environment variables (and optionally the
`TASKCLUSTER_CERTIFICATE` environment variable if using temporary credentials).

## Making a release

This process needs to be automated. Just documenting it now as I work it out. =)

1. Choose an appropriate version number, *X.Y.Z*
2. Update version number in `main.go`, commit it
3. `git tag vX.Y.Z` (note the prefix `v` in the tag name)
4. `git push; git push --tags`
5. Wait for release to magically appear [here](https://github.com/taskcluster/taskcluster-proxy/releases) thanks to travis.
6. Start docker daemon, if not already running (e.g. `boot2docker start`)
7. `./build.sh taskcluster/taskcluster-proxy:X.Y.Z` (no `v` prefix)
8. `./build.sh taskcluster/taskcluster-proxy:latest`
9. `docker push taskcluster/taskcluster-proxy:X.Y.Z` (no `v` prefix in version)
10. `docker push taskcluster/taskcluster-proxy:latest`
