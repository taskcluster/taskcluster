# Validate Library

A single purpose library to wrap up all of the logic for ensuring that
content matches established schemas.

## Requirements

This is tested on and should run on any of node `{8, 10}`.

## Usage

This library is used to manage schemas used within an application.
Schemas are typically stored under `services/<serviceName>/schemas/`, with a directory per schema version.
Schema files in the repository are `.yml` files, but will be published as `.json` files.

```javascript
const SchemaSet = require('taskcluster-lib-validate');

const doc = {'what-is-this': 'it-is-the-json-you-wish-to-validate'};

// Create a SchemaSet for you to use
const schemaset = new SchemaSet({
  serviceName: 'someservice',
  constants: {'my-constant': 42},
});

// The loaded schemas are easily accessible
console.log(schemaset.abstractSchemas())
// ↳ [{'id': '/schemas/someservice/first-schema.json#', ...}, ...]
```

### Schema References

Each schema file is given an identifier when it is loaded (as seen in the `$id` property).
The draft standard specifies that this must be a URI and cannot be relative.
Note that this id is not necessarily a URL; in other words, it may not be possible to fetch the schema at this location via HTTP.
References within the schema, using the `$ref` keyword, can be relative URIs.

This library requires that references are relative, and that their path not begin with `/`.
Thus `{$ref: 'widget-description.json#'}` is allowed, but `{$ref: '/schemas/anotherservice/widget-description.json#'}` and `{$ref: 'https://schemas-r.us/widgets.json'}` are not.
The rationale is that a service must be self-consistent, and any change to a schema requires a corresponding change to the code that handles the data.
A schema from another service could change at any time, invalidating the code in this service.

When initially loading the schema files, the `$id` is of the form `/schemas/<serviceName>/<filename>.json#`.
The schemas have not yet been deployed at a specific root URL, and thus no fixed base location is known.
Such schemas are referred to as "abstract schemas", and are used during the Taskcluster build process to generate documentation and client libraries.

Once a `rootUrl` is supplied, by calling `schemaset.validator`, this library produces an "absolute schema" with `$id` values of the form `<rootUrl>/schemas/<serviceName>/<filename>.json#`.
Not surprisingly, this is a URL, and is the one constructed by the [taskcluster-lib-urls](https://github.com/taskcluster/taskcluster-lib-urls) function `schema`.
When the Taskcluster instance is running, the schema will be available via HTTP GET at that location.

### Validating

You must get a `validator` out of a `SchemaSet` to use it.
A validator is a function that will validate a document's adherence to a schema, given that schema's *absolute* id.
Note that `schemaset.validator` is async.

```javascript
const validate = await schemaset.validator('https://some-taskcluster-root-url.com');
// Check whatever object you wish against whichever schema you wish
let error = validate(
  doc,
  'http://some-taskcluster-root-url.com/someservice/doc-definition.json'
);

// Finally, ensure that there are no errors and continue however you see fit
if (!error) {
  doSomethingWith(doc);
} else {
  yellAboutErrors();
}
```

The return value from `validate` is either `null` if nothing is wrong, or an
error message that tries to do a decent job of explaining what went wrong in
plain, understandable language.  Validation will refer to absolute schema id's
in error messages. For example:

```
Schema Validation Failed:
  Rejecting Schema: https://some-taskcluster-root-url.com/someservice/doc-definition.json
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
    * data should have required property 'tags'
```

All other functionality should be the same as [ajv itself](https://www.npmjs.com/package/ajv).

### Constants

It is possible to specify constants that will be substituted into all of your schemas.

Define constants in `constants.yml`, and refer to them with `{$const: constant-name}`.
For example:

```yaml
# constants.yml
smallest: 43
```

```yaml
# some schema file
type: integer
minValue: {$const: smallest}
```

## Options and Defaults

This section explores some of the options a bit further. In general, your schemas should be
stored in the top-level of your project in `<root of app>/schemas/` and the constants in a yaml file in
that directory called `constants.yaml`. You may override these if desired.

Here are the options along with their default values:

```js
    // The name of this service, e.g. auth, queue, index (required)
    serviceName: null

    // These constants can be subsituted into all of your schemas
    // and can be passed as a path to a yaml file or an object.
    constants: '<root of app>/schemas/constants.yml' || { myDefault: 42 }

    // This folder should contain all of your schemas defined in either json or yaml.
    folder: '<root of app>/schemas'
```

## Testing

Just `yarn install` and `yarn test`. You can set `DEBUG=taskcluster-lib-validate,test` if you want to see what's going on.
There are no keys needed to test this library.

## Changelog

View the changelog on the [releases page](https://github.com/taskcluster/taskcluster-lib-validate/releases).

## License

[Mozilla Public License Version 2.0](https://github.com/taskcluster/taskcluster-lib-validate/blob/master/LICENSE)
