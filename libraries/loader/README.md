# Taskcluster Component Loader

This library provides a means of loading application "components", each of
which can depend on other components.  This makes application startup more
modular and flexible.  It also enables dependency injection during tests.

It is used to run all TaskCluster microservices.

## Components

Each component definition specifies:

  * Name of the component,
  * Required components to be instantiated first, and,
  * How to asynchronously load the component.

All of this is specified as properties of the components object.  A server
component might be defined like this:

```js
  // Definition of 'server' component, notice that components listed in
  // `required` are destructured in the argument to `setup`.
  server: {
    required: ['port'],
    setup: async ({port}) => {
      let server = http.createServer();
      await new Promise((accept, reject) => {
        server.once('error', reject);
        server.once('listening', accept);
        server.listen(ctx.port);
      });
      return server;
    }
  },
```

## Loading

The loader components are all handed to this library, which returns a
`load(componentname, overwrites)` function.  While creating this function, the
library will also ensure that definitions are valid and that the components
form a directed acylic graph (DAG).

Calling the `load` function with a component name will return the result of
that component's setup function (after recursively setting up any of the
component's requirements).   All components are loaded asynchronously: a
component's `setup` function may return a Promise which will be resolved before
setting up components that depend on it.

The following example creates a server, where the port number is provided by
another component.  Note that the `server` component's `setup` method is
asynchronous, and that `await` is used with the `load` method invocation.

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

## Overwrites and Virtual Components

With `overwrites` you can replace a component.  This is particularly useful in
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

  // Virtual components that must always be specified for `load` to work
}, ['port']);

// Create express (here we're forced to specify port)
let server = await load('express', {port: 80});
```

As a neat little treat, the load has a default target `graphviz` which returns
a representation of the dependency graph in graphviz's dot format. This
representation can be rendered using the graphviz tool.

**Remark** the `load` function doesn't have any side-effects on its own, which
means that if you call `load('server')` twice you'll get two different
instantiations of the `server` component and all of its dependencies. This is
particularly useful for getting a fresh component between tests.

## Advice

We generally recommend one component loader per project, and that you expose
it in an executable such that you do `node server.js <component>` to start a
process running the specified component.  A handy way to run the loader on startup,
given both the profile ($NODE_ENV) and process (target component):

```js
// If this file is executed launch component from first argument
if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}
```
