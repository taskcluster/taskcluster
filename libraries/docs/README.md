# Taskcluster Documentation Tool

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-docs.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-docs)
[![npm](https://img.shields.io/npm/v/taskcluster-lib-docs.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-lib-docs)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A simple library to support generation of metadata for Taskcluster libraries, services, and applications.

Metadata includes documentation and API references and schemas.

Requirements
------------

This is tested on and should run on Node 8 and higher.

Operation
---------

**NOTE** this library is in transition between the "old way" and the "new way" as part of Taskcluster's redeployability efforts.
For the moment, both are fully supported.

## The New Way

The library provides an easy way for services, libraries, and tools to support a command that writes their metadata to disk.
This command is used as part of the Taskcluster build process to gather and distribute the metadata across the release.

For microservices, which use `taskcluster-lib-loader` and already have a mechanism for running components, this just entails adding a `writeDocs` loader component and connecting that as a service entrypoint (e.g., with a Procfile).
The build process will invoke this with `DOCS_OUTPUT_DIR` set to the directory that should be populated.

For libraries, applications, and non-Javascript applications, the build process extracts the documentation directly from the repository (using this library).
No API reference or schemas are included in this mode.

## The Old Way

The library works by creating a tarball full of documentation when the
production service starts up.  The tarball contains a mixture of documentation
from the project's README, auto-generated documentation for pulse exchanges and
APIs, and hand-written documentation.

The [taskcluster-docs](https://github.com/taskcluster/taskcluster-docs) project
then downloads those tarballs and incorporates the results into the
documentation page.

Documentation Format
--------------------

The format for the tarball that is uploaded to s3 is [documented here](https://github.com/taskcluster/taskcluster-lib-docs/blob/master/docs/format.md).

Usage
-----

**[Old Way Only] Do not forget to add the scopes before pushing your service to production! `[auth:aws-s3:read-write:taskcluster-raw-docs/<project>/]`**

This library should be included as a component in a [Taskcluster Component Loader](https://github.com/taskcluster/taskcluster-lib-loader)
setup so that it is called upon a service starting in Heroku or as a post-publish step in a library. Options and defaults are listed
below.

This will automatically take any markdown files in a top-level `docs/` directory and turn them into rendered pages on the docs site.
A top-level `README.md` will be uploaded automatically.
In addition, any schemas and references can be passed in, and they'll be turned into documentation as well.

## New Way

The loader component need not be loaded in a running service.
Instead, configure a `writeDocs` component as shown in the example below.

Example
-------

```js
let docs              = require('taskcluster-lib-docs');
let v1                = require('./v1')  # the API declaration
let config            = require('typed-env-config')
let SchemaSet         = require('taskcluster-lib-validate')
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
  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.app.exchangePrefix,
      credentials:      cfg.pulse,
    }),
  },
  docs: {
    requires: ['cfg', 'schemaset', 'reference'],
    setup: ({cfg, schemaset, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemaset,
      references: [
        {
          name: 'api',
          reference: v1.reference(),
        }, {
          name: 'events',
          reference: reference,
        },
      ],
    }),
  },

  writeDocs: {
    requires: ['docs'],
    setup: ({docs}) => docs.write({docsDir: process.env['DOCS_OUTPUT_DIR']}),
  },

  // the server component should depend on `docs` so that it is loaded, but
  // doesn't actually do anything withe value (only for the old way)
  server: {
    requires: ['docs'],
    setup: ({docs}) => {
      // ...
    },
  },
}, ['profile', 'process']);
```

Then, add a `write-docs` option to the service Procfile:

```
write-docs: node src/main writeDocs
```

Options and Defaults
--------------------

The following are the options that can be passed to the publisher function in this library. They are listed with their defaults.

```js

    // A set of Taskcluster credentials. The client must have scope
    // `auth:aws-s3:read-write:taskcluster-raw-docs/<project>/`. Don't forget the
    // trailing slash! Credentials can be omitted if the authBaseUrl points to a
    // proxy that will add credentials.
    credentials: {},

    // The base URL for the auth service.  This can be useful when running in a task with access
    // to a taskclusterProxy
    authBaseUrl: undefined,

    // The name of the project will automatically be set to your package name from package.json,
    // but can be overridden if needed.
    project: '<name of project in package.json>',

    // The path to the README.md file for the project
    readme: '<project root>/README.md',

    // This must be set to the project's tier, corresponding to the section of the docs reference
    // chapter that this will appear in. Options include 'platform', 'core', 'integrations', 'operations',
    // 'libraries', and 'workers'.
    tier: null,

    // This should be a schemaset from taskcluster-lib-validate
    // It provides the data necessary to generate the schema files
    schemaset: null,

    // Optionally help taskcluster-docs pick the order this documetation should appear in on the list.
    menuIndex: 10,

    // If your documentation is in any directory other than '/docs', set this manually.
    docsFolder: rootdir.get() + '/docs',

    // This can be specified as follows:
    // references: [
    //   {name: "api", reference: api.reference},
    //   {name: "events", reference: exchanges.reference},
    // ],
    references: [],

    // Whether or not the generated documentation should be uploaded to s3.  Generally services will only
    // upload in production.  This must be false for the new way.
    publish: process.env.NODE_ENV == 'production',

    // A set of aws credentials that allows you to use this library directly. Must contain both 'accessKeyId'
    // and 'secretAccessKey'.  This is only required if credentials is unavailable.
    aws: null,
```

Development & Testing
---------------------

This library requires a set of Taskcluster credentials to test. Copy `user-config-example.yml` over to `user-config.yml`
and follow the instructions within to get set up.

Once that is complete, `yarn install` and `yarn test`. You can set `DEBUG=taskcluster-lib-docs,test` if you want to see what's going on.

To release, run `yarn version [major, minor, patch]` (following semver) and push
to master.  Travis will take care of the rest.  Generally this change is not
included in the PR.

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-validate/blob/master/LICENSE)
