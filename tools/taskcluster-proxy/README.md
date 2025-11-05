# taskcluster-proxy

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

See [releases page](https://github.com/taskcluster/taskcluster/releases)
and choose a download that matches your platform.

## Download source and install via `go get`

Alternatively you can build and install from source. For this it is recommended
you install the latest version of go (golang) first.

```sh
go get github.com/taskcluster/taskcluster/v92/tools/taskcluster-proxy
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

To run the full test suites you will need to set the `TASKCLUSTER_ROOT_URL` environment variable to point to a running Taskcluster deployment.
It doesn't matter which one!

Running tests is a feature of the build.sh script, and requires the `-t` flag:

```
$ export TASKCLUSTER_ROOT_URL='......'
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
    --client-id <clientId>          Use a specific hawk client id [default: ].
    --access-token <accessToken>    Use a specific hawk access token [default: ].
    --certificate <certificate>     Use a specific hawk certificate [default: ].
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
TASKCLUSTER_ROOT_URL='......'
TASKCLUSTER_CLIENT_ID=.....
TASKCLUSTER_ACCESS_TOKEN=.....
docker run -p 127.0.0.1:8080:80 taskcluster/taskcluster-proxy:latest --client-id "${TASKCLUSTER_CLIENT_ID}" --access-token "${TASKCLUSTER_ACCESS_TOKEN}" --certificate "${TASKCLUSTER_CERTIFICATE}" --root-url "${TASKCLUSTER_ROOT_URL}"
```

In a seperate terminal on your machine, try fetching a private artifact:

```
$ curl -v http://localhost:8080/queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt
```

## HTTP APIs

The taskcluster proxy primarily provides a number of endpoints that you may
call.

### Sign URL (`/bewit`)

To generate a signed url for a given endpoint, make an http POST request to `/bewit`, specifying the target url in the POST body.
Please note, you supply the target url (e.g. `https://taskcluster.example.com/api/queue/v1/...` not `http://localhost:8080/api/queue/v1/...`), in the body.
This can work with any URL, not necessarily one associated with the configured rootUrl.
For example:

```sh
# Returned url will last one hour
curl http://localhost:8080/bewit --data 'https://taskcluster.example.com/api/queue/v1/task/KTBKfEgxR5GdfIIREQIvFQ/runs/0/artifacts/SampleArtifacts%2F_%2FX.txt'
```

### Update Credentials (`/credentials`)

The proxy has the endpoint `/credentials` which accepts a `PUT` request for
updating the credentials used by a running taskcluster-proxy, without needing
to restart it. The body is a credentials object object in json format.
This endpoint is called by `docker-worker` and
`generic-worker` when they receive updated temporary credentials from the queue
for a running task (see
[`queue.claimWork`](https://docs.taskcluster.net/docs/reference/platform/queue/api#claimWork)).
Existing requests will be completed before the credentials are updated, and new
requests will be queued behind the credentials update request. Therefore if a
long transaction is currently in place, the credentials update request may take
longer to complete.


### Proxy Request (`/`)

All other requests will be treated like proxy requests, with the proxy adding
the credentials for the task to the outgoing request.

There are three URL formats supported:

* *Root URL*: `https://<proxy-host>/api/<service-name>/<api-version>/<service-path>`. This format is
  preferred, and is easily generated by giving Taskcluster clients a rootUrl
  pointing to the proxy.

* *Hostname*: `https://<proxy-host>/<service-hostname>/<service-path>`.  This format
  proxies to the given hostname, and is useful for connecting to external
  services that use Taskcluster Hawk authentication.

* *Shortcut*: `https://<proxy-host>/<service-name>/<api-version>/<service-path>`.  This format
  is supported only for backward compatibility with hard-coded URLs.

For example, a PUT request to
`http://localhost:8080/api/auth/v1/clients/project/nss-nspr/rpi-64`, given a
rootUrl of `https://tc.example.com`, would be proxied to
`https://tc.example.com/api/auth/v1/clients/project/nss-nspr/rpi-64`.
