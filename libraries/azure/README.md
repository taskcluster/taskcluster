# Azure Library

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
