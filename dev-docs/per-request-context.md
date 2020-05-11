### Per Request Context

In `taskcluster-lib-api` all handlers get access to the context of an api via `this` inside the handler itself.
Most values are passed through directly to the handler when used but some special Taskcluster libraries
are updated to an instance that is per-request. This is useful for things like having a `requestId` added
automatically to all log messages made from within a handler and passing along `traceId` to a further call
made with a Taskcluster client. For Taskcluster library authors, you can make an instance of your library
support this by having a `taskclusterPerRequestInstance` function on your object that takes `requestId`
and `traceId` as named arguments and returns an instance of itself that will live for the lifespan of the
request and be used within. Both `taskcluster-lib-monitor` and `taskcluster-client` support this and
are good examples of how this can be used.

`traceId` is passed around as a header `x-taskcluster-trace-id` between services. If an external request
sets this header, it will be used. To avoid misuse of this, we recommend running Taskcluster behind
a reverse proxy that will set this header itself and then using `k8s-dns` serviceDiscoveryScheme for
your services.
