TaskCluster Validation Library
==============================

[![Build Status](https://travis-ci.org/taskcluster/taskcluster-lib-validate.svg?branch=master)](https://travis-ci.org/taskcluster/taskcluster-lib-validate)
[![npm](https://img.shields.io/npm/v/taskcluster-lib-validate.svg?maxAge=2592000)](https://www.npmjs.com/package/taskcluster-lib-validate)
[![License](https://img.shields.io/badge/license-MPL%202.0-orange.svg)](http://mozilla.org/MPL/2.0)

A single purpose library to wrap up all of the logic for ensuring that
content matches established schemas. This is a replacement for
[taskcluster/schema-validator-publisher](https://github.com/taskcluster/schema-validator-publisher/blob/master/package.json).


Requirements
------------

This is tested on and should run on any of node `{0.12, 4, 5, 6}`.

Usage
-----

You can view the tests to see more in-detail usage of most features of this library, but the general idea is as follows

```javascript
let doc = {'what-is-this': 'it-is-the-json-you-wish-to-validate'};

// Create a validator for you to use
validate = await validator({ constants: {'my-constant': 42} });

// The loaded schemas are easily accessible
console.log(validate.schemas)
// ↳ [{'id': 'first/schema', ...}, {'id': 'second/schema', ...}, ...]

// Check whatever object you wish against whichever schema you wish
let error = validate(
  doc,
  'http://schemas.taskcluster.net/a-schema-you-wish-to-validate-against'
);

// Finally, ensure that there are no errors and continue however you see fit
if (!error) {
  doSomethingWith(doc);
} else {
  yellAboutErrors();
}
```

The return value is either `null` if nothing is wrong, or an error message that tries to
do a decent job of explaining what went wrong in plain, understandable language. An
error message may look as follows:

```
Schema Validation Failed:
  Rejecting Schema: http://localhost:1203/big-schema.json
  Errors:
    * data should have required property 'provisionerId'
    * data should have required property 'workerType'
    * data should have required property 'schedulerId'
    * data should have required property 'taskGroupId'
    * data should have required property 'routes'
    * data should have required property 'priority'
    * data should have required property 'retries'
    * data should have required property 'created'
    * data should have required property 'deadline'
    * data should have required property 'scopes'
    * data should have required property 'payload'
    * data should have required property 'metadata'
    * data should have required property 'tags' +9ms
```

It is possible to specify constants that will be substituted into all of your schemas.
For examples of this behavior, you can view the tests.

This library will automatically publish schemas to s3 in production if you so desire.

All other functionality should be the same as [ajv itself](https://www.npmjs.com/package/ajv).

You may be tempted to use remote references and be able to validate your service's output
against already defined responses defined in other services. However, this is not allowed by
this library and is not planned to be supported.

Our reasoning is that if you're interacting with the returned results of another service,
the results have already been validated by the output validation of that service. If you wish
to pass this on to your consumers unaltered, you can either mark it as a generic object with
no validation in your output schema (not recommended) or specify how you expect the output to
be (which can just be copied from the other service) and then modify the data you return to
ensure that only those fields you expect are passed on. This will ensure that as services are
modified and updated there will not be unexpected results for downstream dependencies.


Options and Defaults
--------------------

This section explores some of the options a bit further. In general, your schemas should be
stored in the top-level of your project in `<root of app>/schemas/` and the constants in a yaml file in
that directory called `constants.yaml`. You may override these if desired.

```js
    // These constants can be subsituted into all of your schemas
    // and can be passed as a path to a yaml file or an object.
    constants: '<root of app>/schemas/constants.yml' || { myDefault: 42 }

    // This folder should contain all of your schemas defined in either json or yaml.
    folder: '<root of app>/schemas'

    // Whether or not to push your generated schemas out to the world at large.
    publish: process.env.NODE_ENV == 'production'

    // What the root of all of your schemas is. This will make up the first part of
    // the key of your schemas. The default should be correct.
    baseUrl: 'http://schema.taskcluster.net/'

    // Which s3 bucket to push schemas to. The default should be correct.
    bucket: 'schemas.taskcluster.net'

    // Keys to upload to s3 if publishing. Unimportant otherwise.
    aws: null

    // This will be the middle part of any schema key you end up constructing. You must
    // set this for publishing to occur.
    prefix: null

    // This is probably only used for testing. It allows using different libraries for s3.
    s3Provider: require('aws-sdk').S3
```

Testing
-------

Just `npm install` and `npm test`. You can set `DEBUG=taskcluster-lib-validate,test` if you want to see what's going on.
There are no keys needed to test this library.

License
-------

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-validate/blob/master/LICENSE)
