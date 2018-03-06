# taskcluster-proxy

[![logo](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)](https://tools.taskcluster.net/b2d854df0391f8b777f39a486ebbc868.png)

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-proxy.svg?branch=master)](http://travis-ci.org/taskcluster/taskcluster-proxy)
[![GoDoc](https://godoc.org/github.com/taskcluster/taskcluster-proxy?status.svg)](https://godoc.org/github.com/taskcluster/taskcluster-proxy)
[![Coverage Status](https://coveralls.io/repos/taskcluster/taskcluster-proxy/badge.svg?branch=master&service=github)](https://coveralls.io/github/taskcluster/taskcluster-proxy?branch=master)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

taskcluster-proxy is the proxy server which is used by Taskcluster workers to
enable individual tasks to talk to various Taskcluster services (auth, queue,
scheduler, ...) without hardcoding credentials into the containers themselves.

* When used by docker-worker the taskcluster-proxy runs in a separate docker
  container linked to the task docker container.
* When used by generic-worker, the taskcluster-proxy runs as a separate
  native executable on the host.

## Download binary release

You do __not__ need to install go (golang) to run the proxy. It is shipped as a
native executable.

See [releases page](https://github.com/taskcluster/taskcluster-proxy/releases)
and choose a download that matches your platform.

## Download source and install via `go get`

Alternatively you can build and install from source. For this it is recommended
you install the latest version of go (golang) first.

```sh
go get github.com/taskcluster/taskcluster-proxy
```

## Building

If you make source changes, you can rebuild the taskcluster-proxy executable.
This will build and install it under `${GOPATH}/bin`.

To build for just your own platform:

```
$ ./build.sh
```

To build for all supported platforms, add `-a`:

```
$ ./build.sh -a
```

## Testing

To run the full test suites you will need the
[project:taskcluster:taskcluster-proxy-tester
scopes](https://auth.taskcluster.net/v1/roles/project:taskcluster:taskcluster-proxy-tester).
The easiest way to obtain these is to [gain full taskcluster-contributor
scopes](https://github.com/taskcluster/generic-worker/#acquire-taskcluster-credentials-for-running-tests).

The credentials are expected to be in the `TASKCLUSTER_CLIENT_ID` and
`TASKCLUSTER_ACCESS_TOKEN` environment variables. You are advised to create a
permanent client for testing the proxy, which has the single scope
`assume:project:taskcluster:taskcluster-proxy-tester` since some tests require
a permanent client in order to create temporary credentials. Make sure to unset
`TASKCLUSTER_CERTIFICATE` if you previously had set it.

Running tests is a feature of the build.sh script, and requires the `-t` flag:

```
$ export TASKCLUSTER_CLIENT_ID='......'
$ export TASKCLUSTER_ACCESS_TOKEN='......'
$ unset TASKCLUSTER_CERTIFICATE  # permacreds are required for testing
$ ./build.sh -t
```

## Passing credentials via command line options

The current command line options can be seen from the `--help` option:

```
$ taskcluster-proxy --help 2>/dev/null
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
    -i --ip-address <address>       IPv4 or IPv6 address of network interface to bind listener to.
                                    If not provided, will bind listener to all available network
                                    interfaces [default: ].
    -t --task-id <taskId>           Restrict given scopes to those defined in taskId.
    --client-id <clientId>          Use a specific auth.taskcluster hawk client id [default: ].
    --access-token <accessToken>    Use a specific auth.taskcluster hawk access token [default: ].
    --certificate <certificate>     Use a specific auth.taskcluster hawk certificate [default: ].
```

## Passing credentials via environment variables

Credentials may also be passed using environment variables:

* `TASKCLUSTER_CLIENT_ID`
* `TASKCLUSTER_ACCESS_TOKEN`
* `TASKCLUSTER_CERITIFICATE` (when using temporary credentials)

## Example usage

For simplicity the below examples run under `localhost`.

When taskcluster-proxy is running under docker-worker, it is run in a linked
container which is accessible from the docker-worker task container via an http
connection to the host `taskcluster` on port 80.

When taskcluster-proxy is running under generic-worker, it is run as a native
executable on the task host machine, running on port 80. For convenience, the
name `taskcluster` resolves to the loopback interface, so that connections
to the host `taskcluster` on port 80 will also be served by the proxy.

```sh
# Start the proxy server
taskcluster-proxy -p 8080
```

### Make an API call

```
$ curl -v http://localhost:8080/queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt
```

This should give you back something like the following:

```
*   Trying ::1...
* TCP_NODELAY set
* Connected to localhost (::1) port 8080 (#0)
> GET /queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt HTTP/1.1
> Host: localhost:8080
> User-Agent: curl/7.54.0
> Accept: */*
> 
< HTTP/1.1 200 OK
< Accept-Ranges: bytes
< Content-Length: 14
< Content-Type: text/plain; charset=utf-8
< Date: Mon, 05 Mar 2018 18:34:15 GMT
< Etag: "9be2af545d56a97e106d14ceaefe12b7"
< Last-Modified: Mon, 19 Sep 2016 12:10:00 GMT
< Server: AmazonS3
< X-Amz-Id-2: oLf/be4JwtVJEFnmp6aGllJehYCFNWpIuEfJJTkCHNlOiSb2Anmv2ibzh5itkvN2t1PUhT8JsQ8=
< X-Amz-Request-Id: E5D54FD880BD7039
< X-Taskcluster-Endpoint: https://queue.taskcluster.net/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt
< X-Taskcluster-Proxy-Perm-Clientid: mozilla-ldap/pmoore@mozilla.com/dev
< X-Taskcluster-Proxy-Revision: 14b76112fdc3298668bc5d21caf4ee7f5bfa6a59
< X-Taskcluster-Proxy-Version: 4.0.5
< 
test artifact
* Connection #0 to host localhost left intact
```

Note that the `X-Taskcluster-` headers return some useful debugging information.

## Building a docker image for the proxy

The proxy runs fine natively, but if you wish, you can also create a docker image to run it in.

```sh
./dockerbuild.sh 'taskcluster/taskcluster-proxy:latest'
```

This will create a container with the proxy configured to run on port __80__
(not the native default, which is 8080).

## Testing your locally built docker container

First set your environment variables to contain usable taskcluster credentials,
and then start a container, mapping the container port 80 to your localhost
port 8080:

```
TASKCLUSTER_CLIENT_ID=.....
TASKCLUSTER_ACCESS_TOKEN=.....
TASKCLUSTER_CERTIFICATE=.....
docker run -p 127.0.0.1:8080:80 taskcluster/taskcluster-proxy:latest --client-id "${TASKCLUSTER_CLIENT_ID}" --access-token "${TASKCLUSTER_ACCESS_TOKEN}" --certificate "${TASKCLUSTER_CERTIFICATE}"
```

In a seperate terminal on your machine, try fetching a private artifact:

```
$ curl -v http://localhost:8080/queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt
```

## HTTP APIs

The taskcluster proxy primarily provides a number of endpoints that you may
call.

### Sign URL (`/bewit`)

To generate a signed url for a given endpoint, make an http POST request to `/bewit`, specifying the target url in the POST body. Please note, you supply the target url (e.g. https://queue.taskcluster.net/v1/... not http://localhost:8080/queue/v1/...), in the body. For example:

```sh
# Returned url will last one hour
curl http://localhost:8080/bewit --data 'https://queue.taskcluster.net/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt'
```

### Update Credentials (`/credentials`)

The proxy has the endpoint `/credentials` which accepts a `PUT` request for
updating the credentials used by a running taskcluster-proxy, without needing
to restart it. The body is a
[Credentials](https://docs.taskcluster.net/reference/platform/queue/api-docs#claimTask)
object in json format. This endpoint is called by `docker-worker` and
`generic-worker` when they receive updated temporary credentials from the queue
for a running task (see
[queue.reclaimTask](https://docs.taskcluster.net/reference/platform/taskcluster-queue/references/api#reclaimTask)).
Existing requests will be completed before the credentials are updated, and new
requests will be queued behind the credentials update request. Therefore if a
long transaction is currently in place, the credentials update request may take
longer to complete.


### Proxy Request (`/`)

All other requests will be treated like proxy requests, and the following
naming translation will be applied to determine the desired endpoint of the
target request:

```
http://<proxyhost>:<proxyport>/<service>/<path> -> https://<service>.taskcluster.net/<path>
```

For example, a PUT request to
http://localhost:8080/auth/v1/clients/project/nss-nspr/rpi-64 would be proxied
to https://auth.taskcluster.net/v1/clients/project/nss-nspr/rpi-64.

## Making a release

The intended audience of this section is the Taskcluster team.

Run the `release.sh` script in the root directory of this project, with a version number, like this:

```
$ ./release.sh 4.0.6
```

This should tag sources, publish a [release to
github](https://github.com/taskcluster/taskcluster-proxy/releases), a [point
release to
dockerhub](https://hub.docker.com/r/taskcluster/taskcluster-proxy/tags/), and
redirect the 'latest' docker on dockerhub.
