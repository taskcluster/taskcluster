# Taskcluster Azure Shim

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-azure.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-azure)
[![npm](https://img.shields.io/npm/v/taskcluster-lib-azure.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-lib-azure)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A simple library to allow using `azure-entities` and the like, with Taskcluster credentials.

Changelog
---------
View the changelog on the [releases page](https://github.com/taskcluster/taskcluster-lib-azure/releases).

Requirements
------------

This is tested on and should run on any of Node.js `{8, 10}`.

Usage
-----

```js
const {sasCredentials} = require('taskcluster-lib-azure');

MyTable.setup({
  credentials: sasCredentials({
    accountId,     // azure account to use
    tableName,     // table name in that account
    rootUrl,       // TC rootUrl (used to find the auth service)
    credentials,   // Taskcluster credentials
  }), 
  ...,
});
```

If desired, pass `accessLevel`; this defaults to `'read-write'` but can be set to `'read-only'`.

Testing
-------

`yarn install` and `yarn test`.

Hacking
-------

New releases should be tested on Travis to allow for all supported versions of Node to be tested. Once satisfied that it works, new versions should be created with
`yarn version` rather than by manually editing `package.json` and tags should be pushed to Github. Make sure to update [the changelog](https://github.com/taskcluster/taskcluster-lib-azure/releases)!

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-azure/blob/master/LICENSE)
