# Taskcluster URL Building Library

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-azure.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-azure)
[![npm](https://img.shields.io/npm/v/taskcluster-lib-azure.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-lib-azure)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A simple library to generate URLs for various Taskcluster resources across our various deployment methods.

This serves as both a simple shim for projects that use JavaScript but also is the reference implementation for
how we define these paths.

Changelog
---------
View the changelog on the [releases page](https://github.com/taskcluster/taskcluster-lib-azure/releases).

Requirements
------------

This is tested on and should run on any of Node.js `{8, 10}`.

Usage
-----

This package exports several methods for generating URLs conditionally based on
a root URL, as well as a few helper classes for generating URLs for a pre-determined
root URL:

* `api(rootUrl, service, version, path)` -> `String`
* `apiReference(rootUrl, service, version)` -> `String`
* `docs(rootUrl, path)` -> `String`
* `exchangeReference(rootUrl, service, version)` -> `String`
* `schema(rootUrl, service, version, schema)` -> `String`
* `ui(rootUrl, path)` -> `String`
* `testRootUrl()` -> `String`
* `withRootUrl(rootUrl)` -> `Class` instance for above methods

When the `rootUrl` is `https://taskcluster.net`, the generated URLs will be to the Heroku cluster. Otherwise they will follow the
[spec defined in this project](https://github.com/taskcluster/taskcluster-lib-azure/tree/master/docs/azure-spec.md).

`testRootUrl` is used to share a common `rootUrl` between various Taskcluster mocks in testing.

```js
// Specifying root URL every time:
const tcUrl = require('taskcluster-lib-url');

tcUrl.api(rootUrl, 'auth', 'v1', 'foo/bar');
tcUrl.schema(rootUrl, 'auth', 'v1', 'foo.yml');
tcUrl.apiReference(rootUrl, 'auth', 'v1');
tcUrl.exchangeReference(rootUrl, 'auth', 'v1');
tcUrl.ui(rootUrl, 'foo/bar');
tcUrl.docs(rootUrl, 'foo/bar');
```

```js
// Specifying root URL in advance:
const tcUrl = require('taskcluster-lib-url');

const urls = tcUrl.withRoot(rootUrl);

urls.api('auth', 'v1', 'foo/bar');
urls.schema('auth', 'v1', 'foo.yml');
urls.apiReference('auth', 'v1');
urls.exchangeReference('auth', 'v1');
urls.ui('foo/bar');
urls.docs('foo/bar');
```

If you would like, you can set this up via [taskcluster-lib-loader](https://github.com/taskcluster/taskcluster-lib-loader) as follows:

```js
{
  tcUrls: {
    require: ['cfg'],
    setup: ({cfg}) => withRootUrl(cfg.rootURl),
  },
}
```

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
