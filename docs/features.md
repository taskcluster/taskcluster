---
title: Features
order: 10
---

Features are capabilities that can be enabled in the generic worker for use by
a task.

These features are enabled by declaring them within the task payload in the
`features` object.

Note: Some features require additional information within the task definition.
Features may also require scopes.  Consult the documentation for each feature
to understand the requirements.

Example:

```js
{
  "payload": {
    "features": {
      "chainOfTrust": true
    }
  }
}
```

## Feature: `chainOfTrust`

#### Since: generic-worker 5.3.0

Enabling this feature will mean that the generic worker will publish an
additional task artifact `public/chainOfTrust.json.asc`. This will be a clear
text openpgp-signed json object, storing the SHA 256 hashes of the task
artifacts, plus some information about the worker. This is signed by a openpgp
private key, both generated and stored on the worker. This private key is never
transmitted across the network. In future you will be able to verify the
signature of this artifact against the public openpgp key of the worker type,
to be confident that it really was created by the worker. However currently
this is not possible, since we do not yet publish the openpgp public key
anywhere. When this has been implemented, this page will be updated with
details about how to retrieve the public key, for signature verification.

The worker uses the openpgp private key from the file location specified by the
[worker configuration
setting](/reference/workers/generic-worker#set-up-your-env)
`signingKeyLocation`.

No scopes are presently required for enabling this feature.

References:

* [Bugzilla bug](https://bugzilla.mozilla.org/show_bug.cgi?id=1287112)
* [Source code](https://github.com/taskcluster/generic-worker/blob/master/chain_of_trust.go)


## Feature: `taskclusterProxy`

#### Since: generic-worker 10.6.0

The taskcluster proxy provides an easy and safe way to make authenticated
taskcluster requests within the scope(s) of a particular task.  The proxy
accepts un-authenticated requests and attaches credentials to them
corresponding to `task.scopes` as well as scopes to upload artifacts.

The proxy's rootUrl is available to tasks in the environment variable
`TASKCLUSTER_PROXY_URL`.  It can be used with a client like this:

```js
var taskcluster = require('taskcluster-client');
var queue = new taskcluster.Queue({
  rootUrl: process.env.TASKCLUSTER_PROXY_URL,
});
queue.createTask(..);
```

This request would require that `task.scopes` contain the appropriate
`queue:create-task:..` scope for the `createTask` API call.

*NOTE*: as a special case, the scopes required to call
`queue.createArtifact(<taskId>, <runId>, ..)` are automatically included,
regardless of `task.scopes`.

The proxy is easy to use within a shell command, too:

```sh
curl $TASKCLUSTER_PROXY_URL/api/secrets/v1/secret/my-top-secret-secret
# ..or
cat secret | curl --header 'Content-Type: application/json' --request PUT --data @- $TASKCLUSTER_PROXY_URL/api/secrets/v1/secret/my-top-secret-secret
```

These invocations would require `secrets:get:my-top-secret-secret` or `secrets:put:my-top-secret-secret`, respectively, in `task.scopes`.

References:

* [taskcluster-proxy](https://github.com/taskcluster/taskcluster-proxy)
