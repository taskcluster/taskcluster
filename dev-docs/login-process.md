# Login Process

Making a call to a protected Taskcluster API requires a user to be logged in.
The full process consists of:

1. Using a login strategy to acquire an access token.
2. Exchanging the access token for Taskcluster credentials.
3. Calling Taskcluster APIs using the user's Taskcluster credentials.

Let's walk through each process.

## 1. Login Strategy

The purpose of using a login strategy is to produce an access token to be
used in the next step. Taskcluster currently supports the following login strategies:

* GitHub - This lets a user login using GitHub. To configure the strategy,
you will need to register an application with GitHub. If you don’t have one,
you can create one at
[developer applications](https://github.com/settings/applications/new) within
GitHub’s setting panel. Once the application is created, be sure to follow the
guidelines to [enable the `github` strategy](#enabling-a-strategy).

* Mozilla Auth0 - To configure the strategy, you will
need to possess an [auth0 Client](https://auth0.com/docs/clients) which
can access Taskcluster credentials. If you don't have one, you can request a
[New Single Sign On Application in The Hub](https://mozilla.service-now.com/sp?id=sc_cat_item&sys_id=1e9746c20f76aa0087591d2be1050ecb).
Make sure to request a client that uses "RS256 algorithms" and
"OpenIDConnect (OIDC)”. Once the client is created, be sure to follow the
guidelines to [enable the `mozilla-auth0` strategy](#enabling-a-strategy).

All of the strategies use the OAuth 2.0 protocol to authenticate. OAuth 2.0 is
a framework that allows users to grant limited access to their information to
a website without giving them the password.


### Enabling a Strategy

In order to enable a specific strategy, changes to both
`taskcluster-ui` and `web-server` are required. The changes are outlined in
[taskcluster-ui's (login strategies)](https://github.com/taskcluster/taskcluster/tree/master/ui#login-strategies) and
[web-server (login strategies)](https://github.com/taskcluster/taskcluster/tree/master/services/web-server#login-strategies).

### Data Flow

1. The front-end application initiates the login process by sending a request
to `/login/<strategy>` in a new browser window. Since `taskcluster-ui` is a single page application,
there should be a proxy directing requests starting with `/login` to the
server in order not to have the request be misinterpreted as a client-side
route change.

2. The web server gateway triggers the middleware that corresponds to the
specified strategy in the request. The middleware is responsible of redirecting
the request to the provider page where the user will login as well as setting the
`callbackUrl` to `<public-url>/login/<strategy-name>/callback`. The `callbackUrl` is
a URL where the application will receive and process the response
once the authentication is complete. In our case, we handle the response in the server.

3. The `callbackUrl` goes through the proxy mentioned in step 1 and
triggers the callback middleware in the web server. The callback function
is responsible for communicating the user’s information to the front-end
application via the Web API
[`window.postMessage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
in `callback.ejs`(https://github.com/taskcluster/taskcluster/blob/master/services/web-server/src/views/callback.ejs).
For the message to be received successfully, the front-end application
needs to be listening to the `message` event.

_Example: Listening to the `message` event of type `login`_

```js
window.addEventListener(‘message', function handler(e) {
  if (e.origin !== window.origin || !e.data || e.data.type !== ‘login’) {
    return;
  }

  const { type, profile, identityProviderId, accessToken } = e.data;

  // ...
});
```

## 2. Taskcluster Credentials

Authenticating with a login strategy returns back an access token to the caller.
To get Taskcluster credentials, the caller must make a request to
the graphQL `getCredentials` endpoint, including the `accessToken` and `provider`.
The `accessToken` will be verified against the `provider`.
The response will contain Taskcluster credentials corresponding to a temporary client.

## 3. Calling Taskcluster APIs

The Taskcluster credentials have a very short expiration, but can be requested again
when required. Callers should check the expiration before every call to a
Taskcluster API and refresh when necessary. To pass credentials, the caller must
include the `Authorization` header of type `Bearer` with Taskcluster credentials
encoded in base-64. In `taskcluster-ui`, this is codified in
[here](https://github.com/taskcluster/taskcluster/blob/da2ccc8e6a12c53d169c5eea4e306cfd653ac22c/ui/src/App/index.jsx#L95).
