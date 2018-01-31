# Hooks API Documentation

##

Hooks are a mechanism for creating tasks in response to events.

Hooks are identified with a `hookGroupId` and a `hookId`.

When an event occurs, the resulting task is automatically created.  The
task is created using the scope `assume:hook-id:<hookGroupId>/<hookId>`,
which must have scopes to make the createTask call, including satisfying all
scopes in `task.scopes`.  The new task has a `taskGroupId` equal to its
`taskId`, as is the convention for decision tasks.

Hooks can have a "schedule" indicating specific times that new tasks should
be created.  Each schedule is in a simple cron format, per 
https://www.npmjs.com/package/cron-parser.  For example:
 * `['0 0 1 * * *']` -- daily at 1:00 UTC
 * `['0 0 9,21 * * 1-5', '0 0 12 * * 0,6']` -- weekdays at 9:00 and 21:00 UTC, weekends at noon

The task definition is used as a JSON-e template, with a context depending on how it is fired.  See
https://docs.taskcluster.net/reference/core/taskcluster-hooks/docs/firing-hooks
for more information.

## Hooks Client

```js
// Create Hooks client instance with default baseUrl:
// https://hooks.taskcluster.net/v1

const hooks = new taskcluster.Hooks(options);
```

## Methods in Hooks Client

```js
// hooks.listHookGroups :: () -> Promise Result
hooks.listHookGroups()
```

```js
// hooks.listHooks :: hookGroupId -> Promise Result
hooks.listHooks(hookGroupId)
```

```js
// hooks.hook :: (hookGroupId -> hookId) -> Promise Result
hooks.hook(hookGroupId, hookId)
```

```js
// hooks.getHookStatus :: (hookGroupId -> hookId) -> Promise Result
hooks.getHookStatus(hookGroupId, hookId)
```

```js
// hooks.getHookSchedule :: (hookGroupId -> hookId) -> Promise Result
hooks.getHookSchedule(hookGroupId, hookId)
```

```js
// hooks.createHook :: (hookGroupId -> hookId -> payload) -> Promise Result
hooks.createHook(hookGroupId, hookId, payload)
```

```js
// hooks.updateHook :: (hookGroupId -> hookId -> payload) -> Promise Result
hooks.updateHook(hookGroupId, hookId, payload)
```

```js
// hooks.removeHook :: (hookGroupId -> hookId) -> Promise Nothing
hooks.removeHook(hookGroupId, hookId)
```

```js
// hooks.triggerHook :: (hookGroupId -> hookId -> payload) -> Promise Result
hooks.triggerHook(hookGroupId, hookId, payload)
```

```js
// hooks.getTriggerToken :: (hookGroupId -> hookId) -> Promise Result
hooks.getTriggerToken(hookGroupId, hookId)
```

```js
// hooks.resetTriggerToken :: (hookGroupId -> hookId) -> Promise Result
hooks.resetTriggerToken(hookGroupId, hookId)
```

```js
// hooks.triggerHookWithToken :: (hookGroupId -> hookId -> token -> payload) -> Promise Result
hooks.triggerHookWithToken(hookGroupId, hookId, token, payload)
```

```js
// hooks.ping :: () -> Promise Nothing
hooks.ping()
```

