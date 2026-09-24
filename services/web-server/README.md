# Web-Server Service

A web server for supporting the taskcluster-ui repository.
The UI talks to the Taskcluster REST APIs directly; this service handles the parts it cannot:

* user login flows and third-party OAuth2 login, under `/login/*`
* streaming Pulse messages to the browser over WebSocket, at `/subscription/raw` and `/subscription/named`
  (see `src/servers/SubscriptionConnection.js` for the frame protocol)
* profiler endpoints, under `/api/web-server/v1/`

## Configuration

Configuration is done via [@taskcluster/lib-config](../../libraries/config) like all
other Taskcluster services. The main configuration file is `config.yml`, and
that refers to environment variables.  In production, those environment
variables are provided as part of the deployment.  During development,
configuration can be overridden in `user-config.yml`.

## Running Taskcluster-Web-Server locally

See `dev-docs/development-process.md` in this repository for guidance on developing Taskcluster.

## Login Strategies

Taskcluster supports a number of "login strategies" to support users logging into the UI.
See [`docs/login-strategies.md`](./docs/login-strategies.md) for more information.
Note that in most cases setup of login strategies is not required for development of this service.
