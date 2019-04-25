---
title: Getting User Credentials
---

# Getting User Credentials

If you are building a web application that will interact with Taskcluster on
behalf of your user, you will need your users' Taskcluster credentials.

The [Taskcluster manual](/docs/manual/using/integration) contains advice for
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

### Auth0 Set-Up

Follow the [Auth0 documentation](https://auth0.com/docs) and the [Mozilla
guidelines](https://wiki.mozilla.org/Security/Guidelines/OpenID_connect) to set
up sign-in using the "hosted lock".

**TIP:** When setting up an Auth0 client, be sure that it use RS256 for signing
JWTs. Auth0 defaults to HS256, but the auth0-js library only supports RS256.

Make sure your application can support Auth0 sign-in before implementing
Taskcluster-specific functionality.

#### Sign-In Flow

Once you have a clientId established, user sign-in will amount to redirecting
the user to the `/authorize` endpoint with some URL parameters. There are
libraries available for most languages to make this process easier, and the
Auth0 documentation is quite thorough.

The keys to later using this sign-in for access to Taskcluster are:
 * the OIDC audience must include `login.taskcluster.net`
 * the OIDC scopes must include `taskcluster-credentials` and `openid`

When the sign-in is complete, Auth0 will redirect back to your application with
an `id_token` and an `access_token`. The `id_token` can be used by your app to
identify and authorize the user to your backend, just like any OIDC
application. The `access_token` will allow access to the Login service.

#### Renewing Authentication

The tokens returned from Auth0, especially with implicit flow (for single page
applications), do not last very long.  If you expect users to remain "signed
in" to your application for more than a few minutes, you should implement Auth0
session renewal at regular intervals, such as every 15 minutes.

The auth0-js library has a convenient `renewAuth` function that will handle
this flow with a hidden iframe.

### Getting Taskcluster Credentials

Your application should defer getting Taskcluster credentials until they are
needed, and should support automatically refreshing expired credentials as
needed. The credentials may expire before the `access_token` or `id_token`.

To get credentials, call the [`oidcCredentials`
endpoint](/docs/reference/integrations/login/api#oidcCredentials)
with provider `mozilla-auth0`.  Pass the `access_token` from Auth0 in the
`Authorization` header as described in the API documentation.

Note that the returned credentials may or may not contain a `certificate`
field. Be sure that any code handling credentials is compatible with either
result. As always, callers should not interpret the resulting credentials in
any way, although displaying the clientId to the user is acceptable.

The returned credentials contain an expiration time, after which they will
become invalid.  It is up to your application to call `oidcCredentials` as
necessary to get fresh credentials.  The `taskcluster-client-web` library has
an `OIDCCredentialAgent` class that makes this easy.

## Tutorial

The [Taskcluster
manual](/docs/manual/using/integration/frontend)
contains a tutorial which builds a simple single-page application that allows
users to execute a Taskcluster API call.
