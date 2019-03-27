# websocktunnel
[![Task Status](https://github.taskcluster.net/v1/repository/taskcluster/websocktunnel/master/badge.svg)](https://github.taskcluster.net/v1/repository/taskcluster/websocktunnel/master/latest)

Websocketunnel is a service that allows its clients to publicly expose specific HTTP services without publicly exposing the entire host.
"Clients" connect to the websocktunnel service with a specific ID, authenticating with a signed JWT, and upgrade the connection to a websocket.
"Viewers" then connect to the service using a path containing that ID.
The viewer's connection is then proxied to the client via its websocket.
The critical characteristic is that all connections are made *to* the websocktunnel service, so the clients need not be publicly addressible.

# Configuration

Configuration is via environment variables:

* `HOSTNAME` gives the hostname of the websocktunnel service itself. This is used to construct URLs for use by viewers.
* `ENV` defines the runtime environment; use `ENV=production` for production deployments.
* `SYSLOG_ADDR` (optional) defines a syslog server to which log messages will be sent in production
* `TASKCLUSTER_PROXY_SECRET_A` and `TASKCLUSTER_PROXY_SECRET_B` define two secrets, either of which may be used to sign valid JWTs.
  Either secret is accepted, supporting downtime-free rotation of secrets.
* `TLS_KEY` and `TLS_CERTIFICATE` (both optional) define a TLS certificate that is used for the main HTTP service.
  If not given, the service will default to plain HTTP.
  This is not recommended for production usage!
* `PORT` gives the port on which the HTTP server should run, defaulting to 443 (or if not using TLS, 80).
* `AUDIENCE` (aud) claim identifies the recipients that the JWT is intended for. Use of this is OPTIONAL.

In non-production mode, the service logs its activities to stdout in a human-readable format.

# API

The websocktunnel service supports incoming connections from clients and from viewers, as described here.

## Client Connections

To establish a new client connection, make a GET request to the service's hostname with path `/` and the usual websocket upgrade headers, as well as:

 * `Authorization` containing `Bearer <jwt>`; see below
 * `x-websocktunnel-id` containing the client ID

The connection will be upgraded to a websocket connection.
The response will contain the header `x-websocktunnel-client-url` giving the URL viewers can use to reach this client.
Clients can pass this URL, or URLs derived from it, to viewers.
Clients should not make assumptions about the form of this URL.

The client ID must be URL-safe, specifically matching `/^[a-zA-Z0-9_~.-%]+$/`.
It is recommended to urlencode any string to meet this requirement.

### Authorization

The token included in the `Authorization` header must be a [JWT](https://jwt.io/) with the following claims:

 * `tid` -- clientID for the tunnel
 * `iat` -- issuance time (epoch timestamp)
 * `exp` -- expiration time
 * `nbf` -- not-before (set to some time before iat to allow clock skew)
 * `aud` -- audience claim (identifies the recipients)

It must use method `HS256` and be signed with either of the secrets in the service configuration.
It must be valid at the current time, and must not be valid for more than 31 days (specifically, the `nbf` and `exp` claims must be less than 31 days apart).
Its `tid` claim must match the client ID exactly.
`aud` claim is optional,if set on server then must be present in JWT token and must match.

### Multiplexed Websockets

The protocol used within the websocket connection between a client and the websocktunnel service is beyond the scope of this document.
It is implemented by the [`github.com/taskcluster/websocktunnel/wsmux`](https://godoc.org/github.com/taskcluster/websocktunnel/wsmux) package.
The [`github.com/taskcluster/websocktunnel/client`](https://godoc.org/github.com/taskcluster/websocktunnel/client) package uses this to implement the client side of the connection.

The latter package exposes a [`Client`](https://godoc.org/github.com/taskcluster/websocktunnel/client#Client) struct which implements `net.Listener`.
The expectation is that client processes will build a `http.Server` (or equivalent) on top of this `net.Listener`.
All connections to the server with a URL identifying the client will appear as new connections on this listener (that is, by returning a `net.Conn` from `Accept`.
The resulting HTTP request will omit the `/<clientId>` portion of the request path.

Note that this does *not* proxy raw TCP connections: the protocol used between the viewer and server must be HTTP.

## Viewer Connections

Viewers are given a client URL based on that provided to the cient as described above.
All access to such URLs will be tunneled to the client.
If the client is not available, the viewer will get a 404 error response.

No special considerations are required to access viewer URLs: the intent is that any HTTP client can do so.
All HTTP requests are supported: normal HTTP transactions, streaming HTTP requests and responses such as for long polling, and websocket upgrades.

Note that viewer connections do not require any kind of authentication.
That is entirely up to the client.

# API Documentation

See Documentation at [godoc.org](https://godoc.org/github.com/taskcluster/websocktunnel).

# CLI

The `wst-client` command implements a client that will connect to a websocktunnel service and proxy all connections to a specific local port.
It takes a JWT either on the command line or (to enable replacing tokens without losing connections) on stdin.
See the command's `--help` output for details.

# Hosting

In many deployment scenarios, there will be thousands of idle client connections waiting for incoming viewer requests.
This number of connections can easily overwhelm a server, even if the total traffic bandwidth does not.
To cope with this situation, create multiple Websocktunnel instances, each with a different hostname, and configure clients to connect to a specific instance.
How clients are assigned to instances is up to you, but keep in mind that clients may reconnect on connection failure, but if they do not reconnect to the same Websocktunnel instance, then the URL for that client will change.

# Development

This service is tested only with go1.10.

To hack on this service, install it into your GOPATH with `go get -u github.com/taskcluster/websocktunnel`.
Run the tests with the usual `go test` invocation (for example, `go test github.com/taskcluster/websocktunnel`).

## Linting

We use [golangci](https://github.com/golangci/golangci-lint) to run lint checks.
You can install this into your own GOPATH to run the same checks locally with `golangci-lint run`.
If you see different results from those in CI runs on your pull request, check that you are running the same version as required in `.takcluster.yml`

## Changing Dependencies

To add, remove, or update dependencies, use [dep](https://golang.github.io/dep/docs/installation.html).
Do not manually edit anything under the `vendor/` directory!

## Deployment

This service is deployed from a Docker image containing only the single, statically-linked binary.
You can rebuild the docker image with `docker build .`.
The image should be run with the environment variables described above, and the container's port exposed on the Docker host.
Use the same value for PORT as the port exposed on the host (typically 443), as the service will include that port in the URLs it generates.
