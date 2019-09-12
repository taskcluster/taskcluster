# App Library

This library supports Taskcluster microservices, providing a pre-built Express
server based on a common configuration format.

The usage is pretty simple.  It is generally invoked in a
[taskcluster-lib-loader](../loader)
stanza named server, like this:

```js
const App = require('taskcluster-lib-app');
...
  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => App({
        apis: [api],
        port: 80,
        env: 'production',
        forceSSL: true,
        docs,
      });
    },
  },
```

The configuration (here `cfg.server`) has the following options:

 * `apis`: a list of taskcluster-lib-api APIs
 * `port`: port to run the server on
 * `env`: either 'development' or 'production'
 * `forceSSL`: true to redirect to https using sslify; set to true for production
 * `trustProxy`: trust headers from the proxy; set to true for production
 * `contentSecurityPolicy`: include a CSP header with default-src: none; *default is true*
 * `robotsTxt`: include a /robots.txt; *default is true*

The values of the `apis` key are from
[taskcluster-lib-api](../api); each
is the result of the `APIBuilder.build` method in that library. In particular,
each object should have an `express(app)` method which configures an Express
app for the API.

The resulting object is an express server, up and running on the given port.
In testing, save this object and call its `terminate()` method to stop the
server.

## Debugging Abuse

To debug unexpected use of the server, enable `DEBUG=app:request` to see a log
line for each request, including the requesting IP and referrer and user-agent
headers.
