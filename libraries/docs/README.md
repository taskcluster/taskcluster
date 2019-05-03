# Docs Library

A simple library to support generation of metadata for Taskcluster libraries, services, and applications.

Metadata includes documentation and API references and schemas.

Requirements
------------

This is tested on and should run on Node 8 and higher.

Operation
---------

The library provides an easy way for services to export metadata that can be used to build clients and documentation.

Usage
-----

Configure a `writeDocs` loader component as shown in the example below.

Example
-------

```js
let docs              = require('taskcluster-lib-docs');
let builder           = require('./api');
let config            = require('taskcluster-lib-config')
let SchemaSet         = require('taskcluster-lib-validate')
const monitorManager  = require('./monitor');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => config({profile}),
  },
  schemaset: {
    requires: ['cfg'],
    setup: ({cfg}) => new SchemaSet({
      serviceName: 'myservice',
    }),
  },
  docs: {
    requires: ['cfg', 'schemaset'],
    setup: ({cfg, schemaset}) => docs.documenter({
      schemaset,
      references: [
        {
          name: 'api',
          reference: builder.reference(),
        }, {
          name: 'logs',
          reference: monitorManager.reference(),
        }, {
          name: 'events',
          reference: exchanges.reference(),
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },
}, ['profile', 'process']);
```

Then, add a `write-docs` option to the service's `procs.yml`:

```
write-docs:
  type: build
  command: node src/main writeDocs
```

Options and Defaults
--------------------

The following are the options that can be passed to the publisher function in this library. They are listed with their defaults.

```js
    projectName: '<projectName>', // required

    // This should be a schemaset from taskcluster-lib-validate
    // It provides the data necessary to generate the schema files
    schemaset: null,

    // This can be specified as follows:
    // references: [
    //   {name: "api", reference: api.reference},
    //   {name: "events", reference: exchanges.reference},
    // ],
    references: [],
```

Development & Testing
---------------------

This library requires a set of Taskcluster credentials to test. Copy `user-config-example.yml` over to `user-config.yml`
and follow the instructions within to get set up.

Once that is complete, `yarn install` and `yarn test`. You can set `DEBUG=taskcluster-lib-docs,test` if you want to see what's going on.

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-validate/blob/master/LICENSE)
