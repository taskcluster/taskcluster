---
filename: design/devel/best-practices/libraries.md
title: Building Libraries
order: 30
---

Taskcluster's libraries show a great deal more variety than the microservices.
Some aim to be useful outside of Taskcluster, while others are designed specifically for use in our own services.
As such, they share less in common.
However, we can identify a few best practices.

## Repository

Libraries should be in the `taskcluster` Github org.
Those specific to Taskcluster should have the repo prefix `taskcluster-lib-`, while those intended for general use can have arbitrary names.

## Packaging

Use the `files` property in `package.json` to whitelist the files that should be included in the library distribution.
This avoids packaging unnecessary files into the distribution, and more importantly avoids accidentally picking up files containing credentials!
Do *not* include a `.npmignore` file.

This is often as simple as

```js
{
  "files": [
    "lib"
  ]
}
```

You can check what files are being included with `tar -ztf $(npm pack)`.

If the library is transpiled, be sure to include both the ES6/7 input files and the transpiled output.

## Managing Dependencies

We have moved from [npm](https://docs.npmjs.com/cli/npm) to [yarn](https://yarnpkg.com/) for as much as possible. This means that
you should not `npm install` anything and there is no `npm-shrinkwrap.json`. Generally you'll want `yarn install` and `yarn add` in
place of `npm install` and `npm install <package>`. Yarn should keep everything in a `yarn.lock` file that is committed to version
control.

## Publish On Tag

Set up libraries to publish on a tag using [Travis-CI](https://docs.travis-ci.com/user/deployment/npm/).
The appropriate API token is for the 'taskcluster-bot' user, and the the token itself is available in the password store.
Use email `taskcluster-accounts@mozilla.com`.

You will also need to ensure that `taskcluster-bot` is in the list of collaborators for the library.
You can do this via the NPM website.

To publish, run `npm version patch` (or `minor` or `major` depending on the semver changes).
This will update the version, create a new git commit, and create a tag.
So you only need to push to upstream with and without `--tags`:

```
git push upstream
git push upstream --tags
```

When the Travis job for that push completes, the new version should be deployed.
Note that the npmjs.com browser UI is cached and may not immediately represent the updated version.
