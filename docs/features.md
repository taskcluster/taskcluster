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
