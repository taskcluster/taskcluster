# Login API

##

The Login service serves as the interface between external authentication
systems and Taskcluster credentials.

## Login Client

```js
// Create Login client instance with default baseUrl:
// https://login.taskcluster.net/v1

const login = new taskcluster.Login(options);
```

## Methods in Login Client

```js
// login.oidcCredentials :: provider -> Promise Result
login.oidcCredentials(provider)
```

```js
// login.ping :: () -> Promise Nothing
login.ping()
```

