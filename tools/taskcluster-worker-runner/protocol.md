# Runner / Worker Protocol

Start-worker implements a simple protocol for communication between the application and workers.
This is a line-based protocol that runs over the worker's stdin/stdout files.

The intent of this protocol is that it is simple for workers to implement desired features, and does not tie workers to any particular cloud provider or other technology.

Using stdin/stdout has a few advantages:
 - it's secure: no other process can access these connections
 - it's simple to implement
 - it's available on all platforms

## Message Encoding

Each message is in the form of a newline-terminated line of the form

```
~{...}
```

with the `{...}` being a JSON encoding of the message containing at least a `type` property, as described below.

Any line that does not match this pattern is output to the receiving process's stdout in the expectation that it will be fed to a log aggregator.
Note that stderr is not included in the protocol.

## Go Package

The `github.com/taskcluster/taskcluster-worker-runner/protocol` package contains an implementation of this protocol suitable for use by `start-worker` and by a worker.

## Initialization and Capability Negotiation

On startup, start-worker writes a message with type `welcome`, containing an array of capabilities it supports.
```
~{"type": "welcome", "capabilities": [...]}
```

The worker should read this message and reply with `hello`, containing an array of capabilities that is a subset of that provided by start-worker.
The capabilities in the `hello` message become the capabilities for this run, and no messages or functionality not associated with those capabilities can be used by either process.

That array may be empty, indicating no capabilities.
Since all messages aside from `welcome` and `hello` are associated with a capability, the simplest valid implementation of a worker is simply to write
```
~{"type": "hello", "capabilities": []}
```
on startup and nothing more.

If a worker is run outside of a taskcluster-worker-runner context, it will never see the `welcome` message and thus never write `hello` or any other message.

A connection is considered "initialized" on the `hello` message has been sent (on a worker) or received (on start-worker).
Before the connection is initialized, the connection's capabilities are unknown, so protocol users should wait until initialization before querying capabilities.

## Messages

The following sections describe the defined message types, each under a heading giving the corresponding capability.

### shutdown

When worker-runner receives this message, and the provider supports it, it will invoke the function `RemoveWorker` from
worker-manager. If the function fails, then we initiate a system shutdown.

```
~{"type": "shutdown"}
```

This is a no response message.

### graceful-termination

Graceful termination is a way of indicating that the worker should shut down gracefully but quickly.
Typically, workers should stop claiming tasks and resolve any running tasks as `worker-shutdown`.

Graceful termination is initiated by a message from start-worker containing a `finish-tasks` property.
If this property is true, the worker may take the time to finish any running tasks.
If false, then shutdown is imminent and the worker should simply clean up and exit.

```
~{"type": "graceful-termination", "finish-tasks": false}
```

There is no reponse message.
