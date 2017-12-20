TaskCluster-Lib-App
===================

This library supports TaskCluster microservices, providing a pre-built Express
server based on a common configuration format.

The usage is pretty simple.  It is generally invoked in a 
[taskcluster-lib-loader](https://github.com/taskcluster/taskcluster-lib-loader)
stanza named server, like this:

```js
  server: {
    requires: ['cfg', 'api', 'docs'],
    setup: ({cfg, api, docs}) => {

      debug('Launching server.');
      let app = App(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },
```

The configuration (here `cfg.server`) has the following options:

 * `port`: port to run the server on
 * `env`: either 'development' or 'production'
 * `forceSSL`: true to redirect to https using sslify; set to true for production
 * `trustProxy`: trust headers from the proxy; set to true for production
 * `contentSecurityPolicy`: include a CSP header with default-src: none; *default is true*
 * `robotsTxt`: include a /robots.txt; *default is true*
 * `rootDocsLink`: include a lin to the docs in an HTML document at /; *default is true*
 * `docs`: a taskcluster-lib-docs documenter, used to generate the docs link

The resulting object is an express application, configured with the standard
TaskCluster microservice settings.  It should have an API object added to it,
and then its `createServer` method called, which will start the Express app and
return a Promise suitable for use with the loader..
