---
filename: design/devel/best-practices/microservices.md
title: Building Microservices
order: 20
---

The Taskcluster microservices are all maintained independently, but we share responsibility for maintaining them.
This shared responsibility is easier for everyone if the implementations are similar, avoiding surprises when moving from one service to another.
This document aims to collect the practices and standards we've agreed on.

These conventions are strongly encouraged for new services and contributions updating existing services to follow them are always welcome.
When we have a good reason to not follow the convention for a specific service, we document why.

## Package Mechanics

### Node

Prefer to use the latest stable node version, and corresponding yarn version. These should both be locked and not specified
as a range. This means in particular no `^` in front of either version spec.
Encode this version both in `package.json` and in any CI configurations such as `.taskcluster.yml`.

`package.json` should have the `"engine-strict": true` flag set. Preferably directly above the `engines` stanza.

We now try to have all of our services using node 8 or later. This allows us to run directly with the ECMAScript 2017 features
without needing any compilation. For the time being, our libraries will still be compiled to support old services or other users.

## Managing Dependencies

Try to keep up-to-date with the latest versions of all Taskcluster libraries.
In general, the implications of updating these libraries should be clear, and the authors are easy to find when things go badly.

Other dependencies should also be kept up-to-date as much as possible.

### Yarn

We have moved from [npm](https://docs.npmjs.com/cli/npm) to [yarn](https://yarnpkg.com/) for as much as possible. This means that
you should not `npm install` anything and there is no `npm-shrinkwrap.json`. Generally you'll want `yarn install` and `yarn add` in
place of `npm install` and `npm install <package>`. Yarn should keep everything in a `yarn.lock` file that is committed to version
control.

When changing a service's dependencies, use the `yarn` comands.
This will update both `package.json` and `yarn.lock` automatically.

 * `yarn add some-lib`
 * `yarn remove some-lib`
 * `yarn add some-lib@^2.3.0`  (to update an existing dependency's version)

It is the service owner's responsibility to keep dependencies up to date.
The `yarn outdated` command gives a useful overview of available updates.
In general, try to keep packages up to date within semver constraints (so, fix things displayed in red in `yarn outdated`), but be cautious that the new code you are incorporating into your service is trustworthy.
In an ideal world, that means a thorough security review.
In the real world, that probably means a lot less.

## Deployment

### Git Version

The build process should place a file named `.git-version` in the root of the
application directory containing the full Git revision from which the
application was built. This information can then be used for error reporting,
etc.

To accmplish this, the `scripts` section of `package.json` should contain
`"heroku-prebuild": "echo $SOURCE_VERSION > .git-version"`.

### Verification Steps

Somewhere in the README, describe how to deploy the service, if it's anything more complicated than a Heroku app or pipeline.

In any case, include a short description of how to verify that the service is up and running after a deployment.
This may be as simple as loading the relevant tools page and seeing content from the service.

### Logging

Connect the service to the Taskcluster papertrail account.
For Heroku services, follow [the standalone method](http://help.papertrailapp.com/kb/hosting-services/heroku/).
Name the service in papertrail to match the repository name.

## Taskcluster Libraries

### General

Do not use `taskcluster-base`.
Instead, depend directly on the libraries the service requires.

The following sections describe best practices for specific platform libraries.

### taskcluster-lib-loader

The main entry-point for the service should be a file called `main.js`, which should use [taskcluster-lib-loader](https://github.com/taskcluster/taskcluster-lib-loader) for loading components.

### taskcluster-lib-api

The API definition should be in a file called `v1.js` or `api.js`:

```js
var api = new API({
  // ...
});

// Export api
module.exports = api;

/** Get hook groups **/
api.declare({
  // ...
});
// ...
```

This is then imported and set up in `main.js`:

```js
{
  router: {
    requires: ['cfg', 'profile', 'validator', 'monitor'],
    setup: ({cfg, profile, validator, monitor}) => {
      return v1.setup({
        context: {},
        authBaseUrl:      cfg.taskcluster.authBaseUrl,
        publish:          profile === 'production',
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'myservice/v1/api.json',
        aws:              cfg.aws,
        validator,
        monitor,
      });
    },
  },
}
```

#### Error Handling

Do not use `res.status(..)` to return error messages.
Instead, use `res.reportError(code, message, details)`.
The `taskcluster-lib-api` library provides most of the codes you will need, specifically `InvalidInput`, `ResourceNotFound`, and `ResourceConflict`.

Prefer to use these built-in codes.
If you have a case where you must return a different HTTP code, or clients need to be able to distinguish the errors programmatically, add a new error code:

```js
var api = new API({
  description: [
    // ...
    '',
    '## Error Codes',
    '',
    '* `SomethingReallyBad` (472) - you\'re really not going to like this',
  ].join('\n'),
  errorCodes: {
    SomethingReallyBad: 472,
  },
});
// ...
res.reportError('SomethingReallyBad',
  'Something awful happened: {{awfulthing}}',
  {awfulThing: result.awfulness});
```

Be friendly and document the errors in the API's `description` property, as they are not automatically documented.

### taskcluster-lib-monitor

*Do not use* `taskcluster-lib-stats` or `raven`.
Instead, use `taskcluster-lib-monitor` as described in its documentation.

### taskcluster-lib-docs

All services should use `taskcluster-lib-docs` as directed to upload documentation.

The service will include substantial documentation in Markdown format in its `docs/` directory.
The docs library will automatically include the service's `README.md`, as well, and that is a good place to include an overview and development/deployment instructions.

If the service provides an API or pulse exchanges, set it up to publish that information as directed.
