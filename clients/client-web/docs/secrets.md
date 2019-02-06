# TaskCluster Secrets API Documentation

##

The secrets service provides a simple key/value store for small bits of secret
data.  Access is limited by scopes, so values can be considered secret from
those who do not have the relevant scopes.

Secrets also have an expiration date, and once a secret has expired it can no
longer be read.  This is useful for short-term secrets such as a temporary
service credential or a one-time signing key.

## Secrets Client

```js
// Create Secrets client instance:

const secrets = new taskcluster.Secrets(options);
```

## Methods in Secrets Client

```js
// secrets.ping :: () -> Promise Nothing
secrets.ping()
```

```js
// secrets.set :: (name -> payload) -> Promise Nothing
secrets.set(name, payload)
```

```js
// secrets.remove :: name -> Promise Nothing
secrets.remove(name)
```

```js
// secrets.get :: name -> Promise Result
secrets.get(name)
```

```js
// secrets.list :: [options] -> Promise Result
secrets.list()
secrets.list(options)
```

