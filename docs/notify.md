# Notification Service

##

The notification service, typically available at `notify.taskcluster.net`
listens for tasks with associated notifications and handles requests to
send emails and post pulse messages.

## Notify Client

```js
// Create Notify client instance:

const notify = new taskcluster.Notify(options);
```

## Methods in Notify Client

```js
// notify.email :: payload -> Promise Nothing
notify.email(payload)
```

```js
// notify.pulse :: payload -> Promise Nothing
notify.pulse(payload)
```

```js
// notify.irc :: payload -> Promise Nothing
notify.irc(payload)
```

```js
// notify.ping :: () -> Promise Nothing
notify.ping()
```

