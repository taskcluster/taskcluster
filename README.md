# Taskcluster Proxy

This is the proxy server which is used in the docker-worker which allows
individual tasks to talk to various taskcluster services (auth, queue,
scheduler) without hardcoding credentials into the containers
themselves.


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
