# Taskcluster Proxy

This is the proxy server which is used in the docker-worker which allows
individual tasks to talk to various taskcluster services (auth, queue,
scheduler) without hardcoding credentials into the containers
themselves.


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
