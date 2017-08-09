---
title: Getting User Credentials
---

If you are building a web application that will interact with Taskcluster on
behalf of your user, you will need your users' Taskcluster credentials.

The [Taskcluster manual](/manual/using/integration) contains advice for
intergrating with Taskcluster in general, including some important security
considerations.  Here, we'll focus on the technical implementation.

NOTE: This method is *experimental* and still under development.  It is
expected to be production-ready by October 2017.

# Overview

The general process is as follows:

 * The user signs in to your app using an OIDC provider

 * When your app needs to call a Taskcluster API on behalf of the user, it
   first makes a call to the Taskcluster-Login service, passing along a token
   identifying the user.  The service responds with a set of Taskcluster
   credentials.
 
 * The app then calls the Taskcluster API directly, using those credentials.

The service is built to support multiple OIDC providers, but at the moment the
only supported provider is Mozilla's Auth0 account.

## Auth0 Sign-In

Follow the [Auth0 documentation](https://auth0.com/docs) and the [Mozilla
guidelines](https://wiki.mozilla.org/Security/Guidelines/OpenID_connect) to set
up sign-in using the "hosted lock". Once you have a clientId established, this
will amount to redirecting the user to the `/authorize` endpoint with some
URL parameters.

The key to later using this sign-in for access to Taskcluster is to include
`"openid"` in the (space-separated) scopes and to include
`audience=login.taskcluster.net`.

When the sign-in is complete, Auth0 will redirect back to your application with
an `id_token` and an `access_token`. The `id_token` can be used by your app to
identify and authorize the user to your backend, just like any OIDC
application.

## Getting Credentials

Your application should defer getting Taskcluster credentials until they are
needed, and should support automatically re-fetching credentials and re-trying
a request when they expire (identified by a 401 response from a Taskcluster
API).

To get credentials, call the [`oidcCredentials`
endpoint](/reference/integrations/taskcluster-login/references/api#oidcCredentials)
with provider `mozilla-auth0`.  Pass the `access_token` from Auth0 in the
`Authorization` header as described in the API documentation.
