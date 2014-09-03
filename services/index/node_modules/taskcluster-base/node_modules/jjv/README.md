# JJV: JJV JSON Validator

A simple and extensible json-schema validator written in javascript. JJV
runs in the browser and in the server (through node.js), it has no
dependencies and has out-of-the-box AMD support.

JJV implements the latest (v4) JSON Schema Core draft, however due to
performance and security concerns remote schemas are not fetched. To
ensure compliance JJV is tested against JSON Schema Test Suite published
by json-schema.org (and passes all tests). For examples and a detailed
description of the JSON-schema specification visit
[json-schema.org](http://json-schema.org).

JJV is fast! For a detailed performance comparison visit z-schema's
[benchmarks](https://rawgithub.com/zaggino/z-schema/master/benchmark/results.html)
website, which compares various javascript JSON schema validators.

## Basic Usage

In the most basic usage an environment must be created, and one or more
named schemas are registered in the environment (it is also possible to
register schemas with remote URI's in the same way). Javascript
objects can then be validated against any registered schema.

```javascript
// create new JJV environment
var env = jjv();

// Register a `user` schema
env.addSchema('user', {
    type: 'object',
    properties: {
        firstname: {
            type: 'string',
            minLength: 2,
            maxLength: 15
        },
        lastname: {
            type: 'string',
            minLength: 2,
            maxLength: 25
        },
        gender: {
            type: 'string',
            enum: ['male', 'female']
        },
        email: {
            type: 'string',
            format: 'email'
        },
        password: {
            type: 'string',
            minLength: 8
        }
    },
    required: ['firstname', 'lastname', 'email', 'password']
});

// Perform validation against an incomplete user object (errors will be reported)
var errors = env.validate('user', {firstname: 'John', lastname: 'Smith'});

// validation was successful
if (!errors) {
    alert('User has been validated.')
} else {
    alert('Failed with error object ' + JSON.stringify(errors));
}
```

It is also possible to validate objects against unregistered and/or
unnamed schemas by supplying the schema object directly. For example:

```javascript
var env = jjv();

var errors = env.validate({
    type: 'object',
    properties: {
        x: {
            type: 'number'
        },
        y: {
            type: 'number'
        }
    },
    required: ['x', 'y']
 }, {x: 20, y: 50});

```

## Validation Options

JJV provides options to control the validation of required fields, the
handling of default values, and the handling of additional properties.

<table>
    <tr>
        <th>Option</th>
        <th>Default</th>
        <th>Description</th>
    </tr>
    <tr>
        <td>checkRequired</td>
        <td>true</td>
        <td>If true it reports missing required properties, otherwise it
        allows missing required properties.</td>
    </tr>
    <tr>
        <td>useDefault</td>
        <td>false</td>
        <td>If true it modifies the object to have the default values for
        missing non-required fields.</td>
    </tr>
    <tr>
        <td>useCoerce</td>
        <td>false</td>
        <td>If true it enables type coercion where defined.</td>
    </tr>
    <tr>
        <td>removeAdditional</td>
        <td>false</td>
        <td>If true it removes all attributes of an object which are not
        matched by the schema's specification.
    </tr>
</table>

The defaults can be overridden for the entire environment or on a
per-validation basis. For example, to override the checkRequired option
for the entire environment simply do:

```javascript
env.defaultOptions.checkRequired=false;
```

To override the checkRequired option on a per-validation case do:

```
env.validate('schemaName', object, {checkRequired: false});
```

## Advanced Usage

JJV provides mechanisms to add support for custom types, custom formats,
and custom checks.

### Custom Types

Support for additional types can be added through the `addType`
function. For example, a simple implementation of the `date` type could
be the following:

```javascript
env.addType('date', function (v) {
  return !isNan(Date.parse(v));
});
```

### Custom Formats

It is also possible to add support for additional string formats through
the `addFormat` function. For example, an implementation of the
`hexadecimal` string format (already included) could be as follows:

```javascript
env.addFormat('hexadecimal', function (v) {
    return (/^[a-fA-F0-9]+$/).test(v);
});
```

### Custom Checks

It is possible to add support for custom checks (i.e.,
`minItems`, `maxItems`, `minLength`, `maxLength`, etc.) through the
`addCheck` function. For example, an implementation for an `exactLength`
validation keyword that supports arrays and strings can be achieved with
the following:

```javascript
env.addCheck('exactLength', function (v, p) {
    return v.length === p;
});
```

### Custom Type Coercion

JJV allows custom type coercion rules. As an example, supposed that fields
which are declared with as type `integer` are sometimes encoded as a string.
Type coercion allows you to specify that all types declared as `integer` should
be cast/coerced to an `integer` before performing validation.

```javascript
env.addTypeCoercion('integer', function (x) {
    return parseInt(x, 10);
});
```

Recall to set the option `useCoerce` to `true` to enable this feature.

## $data v5 proposal

JJV supports the `$data` spec proposed for draft 5 of json-schema,
complete with relative and absolute JSON pointers.

For information on how to use these feature see the proposal here:

[$data-proposal](https://github.com/json-schema/json-schema/wiki/$data-(v5-proposal)).
