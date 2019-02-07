---
filename: using/integration/frontend.md
title: Frontend Applications
order: 10
---

A frontend application -- one which executes in the browser -- can easily make
calls to Taskcluster APIs using the user's credentials.

The application should handle user logins using the normal Mozilla process --
currently using OpenID Connect via Auth0 and following the IAM team's
[recommendations](https://wiki.mozilla.org/Security/Guidelines/OpenID_connect).
This can support either a single page application
(["SPA"](https://auth0.com/docs/clients#client-types)) with no backend or a
hybrid ("[regular web
application](https://auth0.com/docs/clients#client-types)").

This process supports any authentication and authorization your application
needs for itself - displaying the user's name, storing user settings, or
controlling access to resources based on the user identity.

With a few extra parameters to the login process, this process will produce an
access token which can also be exchanged for Taskcluster credentials as they
are needed, by making an API call to the [login
service](/docs/reference/integrations/taskcluster-login).

The Taskcluster credentials have a very short expiration, but can be requested
again when required. Callers should check the expiration before every call to a
Taskcluster API and refresh when necessary.

## Creating a simple login integration

Authorizing your application to use Taskcluster APIs from a frontend project is relatively
straightforward, but there can be some hurdles to jump through. First, let's talk about a
few prerequisites:

* Possess an [auth0 Client](https://auth0.com/docs/clients) which can access Taskcluster
credentials. If you don't have one, you can request a [New Single Sign On Application in
The Hub](https://mozilla.service-now.com/sp?id=sc_cat_item&sys_id=1e9746c20f76aa0087591d2be1050ecb).
Since this is going to be used on the frontend, make sure to request a client that uses
"RS256 algorithms" and "OpenIDConnect (OIDC)". To be clear, you should also mention in the request
comments that this is a "SPA (single-page application)", and that it "needs to use RS256 algorithms".
* For ease and simplicity, use the [auth0.js client library](https://auth0.com/docs/libraries/auth0js/v8)
and the [taskcluster-client-web](https://github.com/taskcluster/taskcluster-client-web) library.

Now we can begin working on a simple login page. For brevity and demonstration purposes, we will
be using a single HTML file for this, but you can adapt these techniques into any more complex
application, including those using ES imports. Here is the base page markup we are working with:

```html
<!doctype html>
<html>
  <head><title>Taskcluster Login Demo</title></head>
  <body>
    <a id="action-link" href="/login">Login</a><br />
    <pre id="status"></pre>
  </body>
</html>
```

The important parts of this page are an action link and a status container.
We will use the action link to trigger interaction on the page, and the status
container to show the results of our actions.

To start, let's add a few library dependencies before the closing body tag:

```html
<script src="http://cdn.auth0.com/js/auth0/8.9.3/auth0.min.js"></script>
<script src="https://unpkg.com/hawk/lib/browser.js"></script>
<script>window.hawk = hawk; /* hawk's "browser" client doesn't expose itself on window */</script>
<script src="https://wzrd.in/standalone/query-string"></script>
<script src="https://unpkg.com/taskcluster-client-web"></script>
```

The auth0 client library has no external dependencies, and taskcluster-client-web
depends on hawk and query-string, hence the extra additions. Next, let's add
an empty script tag to contain our custom functionality, and capture a reference
to our action link and status container:

```html
<script>
'use strict';

const link = document.getElementById('action-link');
const status = document.getElementById('status');
</script>
```

Now we are going to create an instance of a `WebAuth` from auth0. This is the
entity that lets us communicate with the the auth0 service. This `WebAuth`
instance will take some properties based on how your auth0 client is configured.

```js
const link = document.getElementById('action-link');
const status = document.getElementById('status');
const auth = new auth0.WebAuth({
  domain: 'auth.mozilla.auth0.com',
  responseType: 'token id_token',
  scope: 'taskcluster-credentials openid profile',
  clientID: '<YOUR AUTH0 CLIENT ID>',
  audience: '<YOUR AUTH0 CLIENT AUDIENCE>',
  // This redirect URI is configured with your auth0 client.
  // For this example, we will pretend that our current HTML
  // page is going to be served no matter what route is used
  redirectUri: '<YOUR AUTH0 CLIENT REDIRECT URL>'
});
```

With our auth0 client instance we can now respond to actions. Let's capture
clicks on our action link:

```js
// We are going to get an access token from auth0
// which we can give to Taskcluster. Let's store
// that here when we get it
let accessToken;

link.addEventListener('click', (e) => {
  // make sure the page doesn't redirect on click
  e.preventDefault();
  
  // If we don't yet have out access token, let's go
  // get it from auth0 by having the user sign in
  if (!accessToken) {
    return auth.authorize();
  }
});
```

Loading our page up to this point you will see our action link, and clicking
it will pop up a page to sign in. Once the sign in is complete, auth0 will
redirect back to the `redirectUri` you specified to `WebAuth` with credentials
contained in the URL hash. Using `parseHash` from `WebAuth`, we can parse this
into a friendlier format. Let's add this login after our event handler.

```js
// Let's parse credentials from the hash
// if the hash contains data
if (window.location.hash) {
  auth.parseHash((err, result) => {
    // If there was a problem logging in,
    // let's show it to the user in our status container
    if (err) {
      status.innerText = err.errorDescription;
    } else if (!result || !result.idTokenPayload) {
      // If we didn't have an auth result, something went wrong.
      // At a minimum, let's inform the user about the problem.
      status.innerText = 'Authentication is missing payload';
    } else {
      // The user signed in successfully!
      // Let's save the accessToken, update the UI,
      // and tell the user
      accessToken = result.accessToken;
      status.innerText = 'Authorization successful';
      link.innerText = 'Call Taskcluster API';
    }
  });
}
```

Great, now with our user logged in, and an access token to identify them,
we can now call Taskcluster API methods; we will call `auth.currentScopes`
in our example. In the previous step we changed the action link to say
"Call Taskcluster API". Our next step will be to perform this work using
taskcluster-client-web. Let's modify our action link click handler accordingly:

```js
link.addEventListener('click', (e) => {
  // make sure the page doesn't redirect on click
  e.preventDefault();
  
  // If we don't yet have out access token, let's go
  // get it from auth0 by having the user sign in
  if (!accessToken) {
    return auth.authorize();
  }
  
  // Since we have an access token, clicking on this link
  // means are authenticated and want to interact with the
  // Taskcluster API
  
  // Create an instance of the taskcluster.Auth client,
  // using our access token as the credentials for making
  // subsequent authenticated calls
  const client = new taskcluster.Auth({
    credentialAgent: new taskcluster.OIDCCredentialAgent({
      accessToken,
      oidcProvider: 'mozilla-auth0'
    })
  });
  
  // Let's update the UI and tell the user we are working
  status.innerText = 'Waiting for scopes...';
  
  // With our Taskcluster Auth client, we can request the
  // current user's scopes, and format them for display
  client
    .currentScopes()
    .then(({ scopes }) => {
      status.innerText = scopes
        .map(scope => `- ${scope}`)
        .join('\n');
    })
    .catch(err => {
      // If something went wrong talking to Taskcluster,
      // let's tell the user what happened
      status.innerText = err.message;
    });
});
```

Loading the page now, you have a completely functioning simple authentication site
which can also fetch data and interact with Taskcluster! For completeness,
here is the full code we wrote in order to make this happen:

```html
<!doctype html>
<html>
  <head><title>Taskcluster Login Demo</title></head>
  <body>
    <a id="action-link" href="/login">Login</a><br />
    <pre id="status"></pre>
    <script src="http://cdn.auth0.com/js/auth0/8.9.3/auth0.min.js"></script>
    <script src="https://unpkg.com/hawk/lib/browser.js"></script>
    <script>window.hawk = hawk; /* hawk's "browser" client doesn't expose itself on window */</script>
    <script src="https://wzrd.in/standalone/query-string"></script>
    <script src="https://unpkg.com/taskcluster-client-web"></script>
    <script>
    'use strict';
    
    const link = document.getElementById('action-link');
    const status = document.getElementById('status');
    const auth = new auth0.WebAuth({
      domain: 'auth.mozilla.auth0.com',
      responseType: 'token id_token',
      scope: 'taskcluster-credentials openid profile',
      clientID: '<YOUR AUTH0 CLIENT ID>',
      audience: '<YOUR AUTH0 CLIENT AUDIENCE>',
      // This redirect URI is configured with your auth0 client.
      // For this example, we will pretend that our current HTML
      // page is going to be served no matter what route is used
      redirectUri: '<YOUR AUTH0 CLIENT REDIRECT URL>'
    });
    let accessToken;
    
    link.addEventListener('click', (e) => {
      // make sure the page doesn't redirect on click
      e.preventDefault();
      
      // If we don't yet have our access token, let's go
      // get it from auth0 by having the user sign in
      if (!accessToken) {
        return auth.authorize();
      }
      
      // Since we have an access token, clicking on this link
      // means are authenticated and want to interact with the
      // Taskcluster API
      
      // Create an instance of the taskcluster.Auth client,
      // using our access token as the credentials for making
      // subsequent authenticated calls
      const client = new taskcluster.Auth({
        credentialAgent: new taskcluster.OIDCCredentialAgent({
          accessToken,
          oidcProvider: 'mozilla-auth0'
        })
      });
      
      // Let's update the UI and tell the user we are working
      status.innerText = 'Waiting for scopes...';
      
      // With our Taskcluster Auth client, we can request the
      // current user's scopes, and format them for display
      client
        .currentScopes()
        .then(({ scopes }) => {
          status.innerText = scopes
            .map(scope => `- ${scope}`)
            .join('\n');
        })
        .catch(err => {
          // If something went wrong talking to Taskcluster,
          // let's tell the user what happened
          status.innerText = err.message;
        });
    });
    
    // Let's parse credentials from the hash
    // if the hash contains data
    if (window.location.hash) {
      auth.parseHash((err, result) => {
        // If there was a problem logging in,
        // let's show it to the user in our status container
        if (err) {
          status.innerText = err.errorDescription;
        } else if (!result || !result.idTokenPayload) {
          // If we didn't have an auth result, something went wrong.
          // At a minimum, let's inform the user about the problem.
          status.innerText = 'Authentication is missing payload';
        } else {
          // The user signed in successfully!
          // Let's save the accessToken, update the UI,
          // and tell the user
          accessToken = result.accessToken;
          status.innerText = 'Authorization successful';
          link.innerText = 'Call Taskcluster API';
        }
      });
    }
    </script>
  </body>
</html>
```

## Details

For more details, see the [Taskcluster-Login
Reference](/docs/reference/integrations/taskcluster-login/docs/getting-user-creds).

