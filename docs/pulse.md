# Pulse Management Service

##

The taskcluster-pulse service, typically available at `pulse.taskcluster.net`
manages pulse credentials for taskcluster users.

A service to manage Pulse credentials for anything using
Taskcluster credentials. This allows for self-service pulse
access and greater control within the Taskcluster project.

## Pulse Client

```js
// Create Pulse client instance with default baseUrl:
// https://pulse.taskcluster.net/v1

const pulse = new taskcluster.Pulse(options);
```

## Methods in Pulse Client

```js
// pulse.overview :: () -> Promise Result
pulse.overview()
```

```js
// pulse.listNamespaces :: [options] -> Promise Result
pulse.listNamespaces()
pulse.listNamespaces(options)
```

```js
// pulse.namespace :: namespace -> Promise Result
pulse.namespace(namespace)
```

```js
// pulse.claimNamespace :: (namespace -> payload) -> Promise Result
pulse.claimNamespace(namespace, payload)
```

```js
// pulse.ping :: () -> Promise Nothing
pulse.ping()
```

