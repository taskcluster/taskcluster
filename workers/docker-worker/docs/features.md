---
title: Features
order: 40
---

Features are services provided by docker-worker that give tasks additional
capabilities and in some cases the ability to communicate with external
resources that would otherwise be unavailable.

These features are enabled by declaring them within the task payload in the
`features` object.

Note: Some features require additional information within the task definition.
Consult the documentation for each feature to understand the requirements.

Example:

```js
{
  "payload": {
    "features": {
      "exampleFeature": true
    }
  }
}
```

#### Feature: `balrogVPNProxy`

Required scopes: `docker-worker:feature:balrogVPNProxy`

Some tasks have the need for communicating with production balrog server over
port 80 through a vpn tunnel. The balrog vpn proxy feature allows a task to
direct requests to http://balrog which will proxy the request over a vpn connection
to production balrog.

This is a restricted feature and taskcluster credentials of the submitter must
contain scopes for `docker-worker:feature:balrogVPNProxy`.

To enable, the task must contain the proper scope as well as be declared in
the `features` object within the task payload.

Example:

```js
{
  "scopes": ["docker-worker:feature:balrogVPNProxy"],
  "payload": {
    "features": {
      "balrogVPNProxy": true
    }
  }
}
```

References:

* [taskcluster-vpn-proxy](https://github.com/taskcluster/taskcluster-vpn-proxy)
* [docker-worker integration](https://github.com/taskcluster/docker-worker/blob/master/lib/balrog_vpn_proxy.js)

#### Feature: `taskclusterProxy`

The taskcluster proxy provides an easy and safe way to make authenticated
taskcluster requests within the scope(s) of a particular task.

For example lets say we have a task like this:

```js
{
  "scopes": ["a", "b"],
  "payload": {
    "features": {
      "taskclusterProxy": true
    }
  }
}
```

A special docker container is linked to your task contained named "taskcluster"
with this container linked you can make requests to various taskcluster services
with _only_ the scopes listed in the task (in this case ["a", "b"])

| Host | Service |
|---------------------------------|-------------------------------|
| queue.taskcluster.net           | taskcluster/queue/            |
| index.taskcluster.net           | taskcluster/index/            |
| aws-provisioner.taskcluster.net | taskcluster/aws-provisioner/  |
| secrets.taskcluster.net         | taskcluster/secrets/          |
| auth.taskcluster.net            | taskcluster/auth/             |
| hooks.taskcluster.net           | taskcluster/hooks/            |
| purge-cache.taskcluster.net     | taskcluster/purge-cache/      |

and maybe more - see [the source](https://github.com/taskcluster/taskcluster-proxy/blob/master/taskcluster/services.go).

For example (using curl) inside a task container.

```sh
curl taskcluster/queue/v1/<taskId>
```

You can also use the `baseUrl` parameter in the taskcluster-client

```js
var taskcluster = require('taskcluster-client');
var queue = new taskcluster.Queue({
 baseUrl: 'taskcluster/queue'
 });

queue.getTask('<taskId>');
```

References:

* [taskcluster-proxy](https://github.com/taskcluster/taskcluster-proxy)
* [docker-worker integration](https://github.com/taskcluster/docker-worker/blob/master/lib/features/taskcluster_proxy.js)

#### Feature: `testdroidProxy`

Source: https://github.com/taskcluster/testdroid-proxy

The testdroid proxy allows a task to request and release a device by making
the appropriate calls to http://testdroid. These actions are documented in the
testdroid-proxy
[documentation](https://github.com/taskcluster/testdroid-proxy/blob/master/README.md).

Example:

```js
{
  "payload": {
    "features": {
      "testdroidProxy": true
    },
  }
}
```

References:

* [testdroid-proxy](https://github.com/taskcluster/testdroid-proxy)
* [docker-worker integration](https://github.com/taskcluster/docker-worker/blob/master/lib/features/testdroid_proxy.js)

#### Feature: `dockerSave`

Status: Unstable, api may be changed

When this feature is activated, after the task finishes, a copy of the container is saved using `docker commit`, converted into a tarball with `docker save`, and uploaded to s3 under the filename `public/dockerImage.tar`. The image itself will have repository `task-${taskId}-${runId}:latest` and tag `:latest`.

Example:

```js
{
  "payload": {
    "features": {
      "dockerSave": true
    },
  }
}
//run task
```

Then, once the task finishes, the resulting image can be pulled and run in the following manner:

```bash
wget https://queue.taskcluster.net/v1/task/${taskId}/runs/${runId}/artifacts/public/dockerImage.tar
docker load < dockerImage.tar
docker run -it task-${taskId}-${runId}:latest /bin/sh
```

Caches are also uploaded as artifacts under `public/cache/${cacheName}.tar` if they exist, to give the full environment under which the container is running. They be added by adding `-v host/cache:container/cache` as an option where the locations match the untarred cache on your machine and the targeted location in the container's payload.

References:

* [implementation](https://github.com/taskcluster/docker-worker/blob/master/lib/features/docker_save.js)

#### Feature: `interactive`

Allows ssh-like access to running containers. Will extend the lifetime of a task to allow a user to SSH in before the container dies, so be careful when using this feature. Will also keep the task alive while is connected and a little bit after that so a user can keep working in ssh after the task ends.

Example:

```js
{
  "payload": {
    "features": {
      "interactive": true
    },
  }
}
```
Then click on the `interactive.html` on task inspector link to enter the container.

References:

* [docker-worker integration](https://github.com/taskcluster/docker-worker/blob/master/lib/features/interactive.js)
* [implementation](https://github.com/taskcluster/docker-exec-websocket-server)

#### Feature: `relengAPIProxy`

Status: stable, but limited access

Like the Taskcluster proxy, this proxy allows easy and safe access to RelengAPI without embedding RelengAPI credentials in the task.

The task must indicate the RelengAPI permissions it needs using scopes of the form `docker-worker:relengapi-proxy:<permission>`.
Wildcard expansion is not allowed.

Example:

```js
{
  "scopes": [
    "docker-worker:relengapi-proxy:tooltool.download.internal"
  ],
  "payload": {
    "features": {
      "relengAPIProxy": true,
    }
  }
}
```

Requests can then be made from the task container, using `http://relengapi` in place of `https://api.pub.build.mozilla.org`.

The set of allowed RelengAPI permissions are currently limited to

 * `tooltool.download.public`
 * `tooltool.download.internal`

References:

* [relengapi-proxy](https://github.com/taskcluster/relengapi-proxy)

#### Feature: `allowPtrace`

Status: stable

This feature allows tasks to use the ptrace(2) syscall.
The Firefox crash reporter, for example, requires this functionality.

The feature accomplishes its magic by creating a task-specific AppArmor profile that allows any process in the profile to trace any other process in the profile.
While this should be safe, assuming that all processes in the task container are at an equal privilege level, it is a deviation from the Docker security model and thus should be used with caution.

The task needs `docker-worker:feature:allowPtrace` scope to run with this feature enabled.

