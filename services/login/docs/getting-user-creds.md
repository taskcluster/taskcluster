---
title: Getting User Credentials
---

If you are building a web application that will interact with Taskcluster on
behalf of your user, you will need your users' Taskcluster credentials.

The [Taskcluster manual](/manual/using/integration) contains advice for
intergrating with Taskcluster in general, including some important security
considerations.  Here, we'll focus on the technical implementation.

## Overview

The general process is as follows:

 * The user signs in to your app using an OIDC provider

 * When your app needs to call a Taskcluster API on behalf of the user, it
   first makes a call to the Taskcluster-Login service, passing along a token
   identifying the user.  The service responds with a set of Taskcluster
   credentials.
 
 * Your app then calls the Taskcluster API directly, using those credentials.

The service is built to support multiple OIDC providers, but at the moment the
only supported provider is Mozilla's Auth0 account.

### Auth0 Sign-In

Follow the [Auth0 documentation](https://auth0.com/docs) and the [Mozilla
guidelines](https://wiki.mozilla.org/Security/Guidelines/OpenID_connect) to set
up sign-in using the "hosted lock". Once you have a clientId established, this
will amount to redirecting the user to the `/authorize` endpoint with some URL
parameters. There are libraries available for most languages to make this
process easier, and the Auth0 documentation is quite thorough.

The keys to later using this sign-in for access to Taskcluster are:
 * the OID audience must include `login.taskcluster.net`
 * the OIDC scopes must include `full-user-credentials` and `openid`

When the sign-in is complete, Auth0 will redirect back to your application with
an `id_token` and an `access_token`. The `id_token` can be used by your app to
identify and authorize the user to your backend, just like any OIDC
application. The `access_token` will allow access to the Login service.

### Getting Credentials

Your application should defer getting Taskcluster credentials until they are
needed, and should support automatically refreshing expired credentials as
needed. The credentials may expire before the `access_token` or `id_token`.

To get credentials, call the [`oidcCredentials`
endpoint](/reference/integrations/taskcluster-login/references/api#oidcCredentials)
with provider `mozilla-auth0`.  Pass the `access_token` from Auth0 in the
`Authorization` header as described in the API documentation.

Note that the returned credentials may or may not contain a `certificate`
field. Be sure that any code handling credentials is compatible with either
result. As always, callers should not interpret the resulting credentials in
any way, although displaying the clientId to the user is acceptable.

## Demo

The
[taskcluster-oidc-test](https://github.com/taskcluster/taskcluster-oidc-test)
repository provides an example of a sipmle single page app following this
process.  You can see it in action at
https://taskcluster-oidc-test.herokuapp.com.
