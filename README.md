# taskcluster-proxy
<img hspace="20" align="left" src="https://tools.taskcluster.net/lib/assets/taskcluster-120.png" />
[![Build Status](https://travis-ci.org/taskcluster/taskcluster-proxy.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-proxy)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-proxy?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-proxy)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-proxy/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-proxy?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

This is the proxy server which is used in the docker-worker which allows
individual tasks to talk to various taskcluster services (auth, queue,
scheduler) without hardcoding credentials into the containers
themselves.

Credentials are expected to be passed via the `TASKCLUSTER_CLIENT_ID`
and `TASKCLUSTER_ACCESS_TOKEN` environment variables.


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
docker image. [Godep](https://github.com/tools/godep) is required to run
this script.

```sh
./build.sh user/taskcluster-proxy-server
```

## Download via `go get`

```sh
go get github.com/taskcluster/taskcluster-proxy
```

## Hacking

Follow usual go path setup + godeps.

```sh
# inside the project root which will look something like:
# $GOPATH/src/github.com/taskcluster/taskcluster-proxy
godep go build
```

## Tests

To run the full test suites you need a [taskcluster auth](http://auth.taskcluster.net/)
token with at least scopes to the auth server `"auth:*"`. The
credentials are expected to be in the `TASKCLUSTER_CLIENT_ID` and
`TASKCLUSTER_ACCESS_TOKEN` environment variables.
