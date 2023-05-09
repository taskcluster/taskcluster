# Runner / Worker Protocol

This package implements a simple protocol for communication between the application and workers.
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

Any line that does not match this pattern is logged using the standard `log` package.
Note that stderr is not included in the protocol.

## Go Package

The `github.com/taskcluster/taskcluster/v50/tools/workerproto` package contains an implementation of this protocol suitable for use by `start-worker` and by a worker.

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

A connection is considered "initialized" on the `hello` message has been sent (on a worker) or received (on start-worker).
Before the connection is initialized, the connection's capabilities are unknown, so protocol users should wait until initialization before querying capabilities.

## Messages

The following sections describe the defined message types, each under a heading giving the corresponding capability.

### error-report

This message type, sent from the worker, contains an error report intended for the worker-manager to display among its worker pool errors.

```
~{"type": "error-report", "kind": "critical", "title": "a serious error", "description": "bad stuff has happened!", "extra": {"number of failures": 1}}
```

See [here](https://docs.taskcluster.net/docs/reference/core/worker-manager/api#reportWorkerError) for documentation on worker-manager's `reportWorkerError` API.

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

### log

This message type, sent from the worker, contains a structured log message for transmission to a log destination.

```
~{"type": "log", "body": {"textPayload": "A thing happened!"}}
~{"type": "log", "body": {"level": "catastrophic", "code": "red"}}
```

Note that for non-structured log destinations, the body property `textPayload` is treated specially as the primary field of the message.
Using this property will make non-structured logs much easier to read.

There is no reponse message.

### new-credentials

This message type, sent from worker-runner, contains new credentials which the worker should use for subsequent Taskcluster API calls that are not related to a task.
This mesage is sent when credentials are renewed.
The message may or may not contain a `certificate` property.

```
~{"type": "new-credentials", "client-id": "...", "access-token": "..."}
~{"type": "new-credentials", "client-id": "...", "access-token": "...", "certificate": "..."}
```

If this message is not supported, worker-runner will attempt to gracefully shut down the worker when credentials expire.
