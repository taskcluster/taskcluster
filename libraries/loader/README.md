# Taskcluster Component Loader

Creates a component loader from a set of inter-dependent component definitions.
Each component definition specifies:
  * Name of the component,
  * Required components to be instantiated first, and,
  * How to asynchronously load the component.

Given a set of these definitions, `taskcluster-lib-loader` will ensure that
definitions are valid, that dependencies forms a directed acylic graph (DAG),
and return a method `load(componentName, overwrites)` which will asynchronously
load a component by `componentName`. Before loading the component it will
load all dependent components not specified in the `overwrites` dictionary.

**Example**
```js
let loader = require('taskcluster-lib-loader');

// Create loader
let load = loader({
  // Definition of 'port' component
  port: {
    required: [],
    setup: () => {
      return parseInt(process.env.PORT);
    }
  },

  // Definition of 'server' component, notice that components listed in
  // `required` are present as properties on `ctx`
  server: {
    required: ['port'],
    setup: async (ctx) => {
      let server = http.createServer();
      await new Promise((accept, reject) => {
        server.once('error', reject);
        server.once('listening', accept);
        server.listen(ctx.port);
      });
      return server;
    }
  },
});

// Create server
let server = await load('server');
```

With `overwrites` you can replace a component, this is particularly useful in
tests where you may want to inject a mock component, but still load the same
end result. In the example we could overwrite `port` using:

```js
// Create server overwriting the 'port' component
let server = await load('server', {port: 8080});
```

Finally, you can specify virtual components, for example you may wish to force
the caller of `load` to always specify a port.

```js
let loader = require('taskcluster-lib-loader');

// Create loader
let load = loader({
  // Definition of 'server' component
  server: {
    required: ['port'],
    setup: async (ctx) => {
      let server = http.createServer();
      await new Promise((accept, reject) => {
        server.once('error', reject);
        server.once('listening', accept);
        server.listen(ctx.port);
      });
      return server;
    }
  },
  
  // Definition of 'express' component, notice that even through the 'server'
  // components setup function returns a promise, `ctx.server` is a server
  // object as resolved.
  express: {
    required: ['server'],
    setup: (ctx) => {
      let app = express();
      // setup routes...
      ctx.server.on('request', app);
      return app;
    }
  }

  // Virtual components must always be specified for `load` to work
}, ['port']);

// Create express (here we're forced to specify port)
let server = await load('express', {port: 80});
```

As a neat little the load has a default target `graphviz` which returns a
graphical representation of the dependency graph in graphviz format.

**Remark** the `load` function doesn't have any side-effects on it's own, which
means that if you call `load('server')` twice you'll get two different
instantiations of the `server` component and all of its dependencies. This is
particularly useful for getting a fresh component between tests.

We generally recommend one component loader per project, and that you expose
it in an executable such that you do `node server.js <component>` to start a
process running the specified component.
