# Taskcluster Proxy

This is the proxy server which is used in the docker-worker which allows
individual tasks to talk to various taskcluster services (auth, queue,
scheduler) without hardcoding credentials into the containers
themselves.

Credentials are expected to be passed via the `TASKCLUSTER_CLIENT_ID`
and `TASKCLUSTER_ACCESS_TOKEN` environment variables.

## Deployment

The proxy server can be deployed directly by building `proxy/main.go`
but the prefered method is via the `./build.sh` script which will
compile the proxy server for linux/amd64 and deploy the server to a
docker image.

```sh
./build.sh user/taskcluster-proxy-server
```

## Download via `go get`

```sh
go get github.com/lightsofapollo/taskcluster-proxy/proxy
```

## Hacking

Follow usual go path setup.

```sh
# inside the project root which will look something like:
# $GOPATH/src/github.com/lightsofapollo/taskcluster-proxy
cd proxy
go build
```

## Tests

To run the full test suites you need a [taskcluster auth](http://auth.taskcluster.net/)
token with at least scopes to the auth server `"auth:*"`. The
credentials are expected to be in the `TASKCLUSTER_CLIENT_ID` and
`TASKCLUSTER_ACCESS_TOKEN` environment variables.
