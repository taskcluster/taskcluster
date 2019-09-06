---
title: Third Party Login
order: 30
---

# Third Party Login

The "big picture" here is that a Taskcluster deployment acts as an OAuth2 authorization server and resource server.
The "resource" that the deployment protects is Taskcluster credentials. Thus a client carries out a standard OAuth2
authorization transaction, then uses the resulting access_token to request Taskcluster credentials as needed.

The deviations from OAuth2 are as follows:
* The scope arguments are Taskcluster scopes, with * carrying its usual meaning; and
* The authorize request has an nonstandard, optional expires query parameter.

## OAuth2 Authorization Server
   
Taskcluster implements the OAuth2 protocol, supporting both the "Implicit" and "Authorization Code" flows.
The "Resource Owner Password Credentials" and "Client Credentials" flows are not supported.
Clients are [pre-defined](/docs/manual/deploying/third-party), and each pre-defined client indicates which flow it
uses (and cannot use both). Some clients are whitelisted, meaning that user consent is not required.

Note that the implicit flow is similar to the authorization code flow, with differences highlighted in
[RFC 6749](https://tools.ietf.org/html/rfc6749#section-1.3.2).

## OAuth2 Resource Server

The Taskcluster deployment acts as a "resource server" by serving Taskcluster credentials in given a valid OAuth2 `access_token`.

This is accomplished by calling the endpoint `<rootUrl>/login/oauth/credentials` with the header
```
Authorization: bearer <access_token>
```

The response is a JSON body of the form:
```json
{
    "credentials": {
        "clientId": "...",
        "accessToken": "..."
    },
    "expires": "..."
}
```

Note that this is the only Taskcluster endpoint that accepts the OAuth2 access token.
All other endpoints require Taskcluster credentials.

The expires property gives the expiration time for the given credentials,
and corresponds to the expires value the user earlier consented to. The client indicated in
the credentials has the clientId described above, and as such is scanned periodically for
alignment with the associated user's access. It will be automatically disabled if the user's
access no longer satisfies its scopes. The client can also be disabled or deleted manually
in the event of compromise.

This endpoint does not produce temporary credentials, as such credentials are not revocable.

## Client Registration

A third party needs to have a client registered in the deployment configuration of the web-server service before
being able to get Taskcluster credentials for a user. Refer to the third-party
[deploying docs](/docs/manual/deploying/third-party) for more information.

## Access Tokens

There are actually three distinct "access token":

1. The access token we get from the login strategy (e.g., Auth0 OIDC access_token, or GitHub OAuth2 access_token)
2. The access token we give to third parties
3. The accessToken property of the resulting Taskcluster credentials

## Tutorial

The [Taskcluster
manual](/docs/manual/using/integration/frontend)
contains a tutorial which builds a simple single-page application that allows
users to execute a Taskcluster API call.
