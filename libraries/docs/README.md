# Taskcluster Documentation Tool

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-docs.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-docs)
[![npm](https://img.shields.io/npm/v/taskcluster-lib-docs.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-lib-docs)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A simple library to allow all of our libraries and services to update their own documentation automatically upon publish or deploy.

Changelog
---------
View the changelog on the [releases page](https://github.com/taskcluster/taskcluster-lib-docs/releases).

Requirements
------------

This is tested on and should run on any of node `{0.12, 4, 5, 6}`.

Usage
-----

**Do not forget to add the scopes before pushing your service to production! `[auth:aws-s3:read-write:taskcluster-raw-docs/<project>/]`**

This library should be included as a component in a [Taskcluster Component Loader](https://github.com/taskcluster/taskcluster-lib-loader)
setup so that it is called upon a service starting in Heroku or as a post-publish step in a library. Options and defaults are listed
below.

This will automatically take any markdown files in a top-level `docs/` directory and turn them into rendered pages on the docs site. In addition,
any schemas and references can be passed in, and they'll be turned into documentation as well.

Example
-------

```js
let docs              = require('taskcluster-lib-docs');
let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },
  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => base.validator({
      prefix: 'service/v1/',
      aws: cfg.aws,
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
    requires: ['cfg', 'validator', 'reference'],
    setup: ({cfg, validator, reference}) => docs.documenter({
      credentials: cfg.taskcluster.credentials,
      tier: 'core',
      schemas: validator.schemas,
      references: [
        {
          name: 'api',
          reference: api.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        }, {
          name: 'events',
          reference: reference,
        },
      ],
    }),
  },
}, ['profile', 'process']);
```

Options and Defaults
--------------------

The following are the options that can be passed to the publisher function in this library. They are listed with their defaults.

```js
    // A set of Taskcluster credentials that must contain both 'clientId' and 'accessToken' fields
    // The client must have scopes for [ auth:aws-s3:read-write:taskcluster-raw-docs/<project>/ ]
    // Don't forget the trailing slash!
    credentials: {},

    // The name of the project will automatically be set to your package name from package.json,
    // but can be overridden if needed.
    project: '<name of project in package.json>',

    // This must be set to either one of 'platform' or 'core'. It specifies the section
    // of the docs site this will appear in.
    tier: null,

    // This should be set to the value of the schemas field from an instance of taskcluster-lib-validate.
    schemas: {},

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

    // Whether or not the generated documentation should be uploaded to s3.
    publish: process.env.NODE_ENV == 'production',
```

Testing
-------

This library requires a set of Taskcluster credentials to test. Copy `user-config-example.yml` over to `user-config.yml`
and follow the instructions within to get set up.

Once that is complete, `npm install` and `npm test`. You can set `DEBUG=taskcluster-lib-docs,test` if you want to see what's going on.

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-validate/blob/master/LICENSE)
