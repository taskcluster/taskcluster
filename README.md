# taskcluster-proxy

[![logo](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-proxy.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-proxy)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-proxy?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-proxy)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-proxy/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-proxy?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

taskcluster-proxy is the proxy server which is used by Taskcluster workers to
enable individual tasks to talk to various Taskcluster services (auth, queue,
scheduler, ...) without hardcoding credentials into the containers themselves.

When used by docker-worker (main use case) the taskcluster-proxy runs in a
separate docker container linked to the task docker container. However, there
is no requirement for the taskcluster-proxy to run inside a docker container,
you can also run it natively. It is written in go (golang) and therefore
compiles to a native executable (in other words, you do not need to install go
(golang) in order to run it).

## Download binary release

See [releases page](https://github.com/taskcluster/taskcluster-proxy/releases)
and choose a download that matches your platform.

## Download source and install via `go get`

Alternatively you can build and install from source:

```sh
go get github.com/taskcluster/taskcluster-proxy
```

## Running

If you make source changes, `go install ./...` will rebuild and reinstall `taskcluster-proxy`
in your `GOPATH` for you.

#### Credentials via Command Line Options

```
$ "${GOPATH}/bin/taskcluster-proxy" --help
Taskcluster authentication proxy. By default this pulls all scopes from a
particular task but additional scopes may be added by specifying them after the
task id.

  Usage:
    taskcluster-proxy [options] [<scope>...]
    taskcluster-proxy -h|--help
    taskcluster-proxy --version

  Options:
    -h --help                       Show this help screen.
    --version                       Show the taskcluster-proxy version number.
    -p --port <port>                Port to bind the proxy server to [default: 8080].
    -t --task-id <taskId>           Restrict given scopes to those defined in taskId.
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
```

#### Credentials via Environment Variables

Credentials may also be passed using environment variables:

* `TASKCLUSTER_CLIENT_ID`
* `TASKCLUSTER_ACCESS_TOKEN`
* `TASKCLUSTER_CERITIFICATE` (when using temporary credentials)

**Please do not use these environment variables in production**,
instead use command line options as described above.

## Examples

For simplicity the below examples run under `localhost`. This is also how
taskcluster-proxy is used by docker-worker: taskcluster-proxy runs in a linked
container and is accessed from the docker-worker container via a http(s)
connection (typically https://localhost:60024/).

```sh
# Start the proxy server; note that 2sz... is the taskId
taskcluster-proxy -t 2szAy1JzSr6pyjVCdiTcoQ -p 60024
```

#### Fetch a task

```sh
curl localhost:60024/queue/v1/task/2szAy1JzSr6pyjVCdiTcoQ
```

#### Create a signed url for the given task (bewit)

Note: the given taskId below is just an example for demonstration purposes.

```sh
# Returned url will last one hour
curl localhost:60024/bewit --data 'https://queue.taskcluster.net/v1/task/2szAy1JzSr6pyjVCdiTcoQ'
```

## Creating a docker image for the proxy

The proxy runs fine natively, but if you wish, you can also create a docker image to run it in.

```sh
./build.sh 'user/taskcluster-proxy:latest'
```

## Endpoints

#### Credentials Update

The proxy has the endpoint `/credentials` which accepts `PUT` request for
credentials update. The body is a
[Credentials](https://docs.taskcluster.net/reference/platform/queue/api-docs#claimTask)
object in json format.


## Running tests

To run the full test suites you need taskcluster credentials with at least the
following scopes:

  * `auth:azure-table-access:fakeaccount/DuMmYtAbLe`
  * `auth:create-client:garbage/*`
  * `queue:create-task:highest:win-provisioner/win2008-worker`
  * `queue:get-artifact:private/build/sources.xml`
  * `queue:route:tc-treeherder.mozilla-inbound.*`
  * `queue:route:tc-treeherder-stage.mozilla-inbound.*`
  * `queue:scheduler-id:go-test-test-scheduler`

The credentials are expected to be in the `TASKCLUSTER_CLIENT_ID` and
`TASKCLUSTER_ACCESS_TOKEN` environment variables (and optionally the
`TASKCLUSTER_CERTIFICATE` environment variable if using temporary credentials).

Then run `go test -v ./...` from the top level source directory.

## Making a release

Run the `release.sh` script in the root directory of this project, with a version number, like this:

```
$ ./release.sh 4.0.6
```
