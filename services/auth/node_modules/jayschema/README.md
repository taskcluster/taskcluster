# JaySchema

A [JSON Schema](http://json-schema.org/documentation.html) validator for Node.js.

* Complete validation coverage of JSON Schema Draft v4.
* Optional dynamic loader for referenced schemas (load schemas from a database or the web)
* Useful error messages.

## Install

    npm install jayschema

## Usage

### Basic usage

```js
var JaySchema = require('jayschema');
var js = new JaySchema();
var instance = 64;
var schema = { "type": "integer", "multipleOf": 8 };

// synchronous…
console.log('synchronous result:', js.validate(instance, schema));

// …or async
js.validate(instance, schema, function(errs) {
    if (errs) { console.error(errs); }
    else { console.log('async validation OK!'); }
});
```

### Loading schemas from HTTP or from your database

Here the Geographic Coordinate schema is loaded over HTTP. You can also supply your own loader—for example, to load schemas from a database.

```js
var JaySchema = require('jayschema');
var js = new JaySchema(JaySchema.loaders.http);     // we provide the HTTP loader here
                                                    // you could load from a DB instead

var instance = { "location": { "latitude": 48.8583, "longitude": 2.2945 } };
var schema = {
    "type": "object",
    "properties": {
        "location": { "$ref": "http://json-schema.org/geo" }
    }
};

js.validate(instance, schema, function(errs) {
  if (errs) { console.error(errs); }
  else { console.log('validation OK!'); }
});
```

## Why JSON Schema?

* Validate JSON server-side:
    * For your JSON-based API
    * For data that you want to store in a NoSQL database
* No [ORM](https://npmjs.org/browse/keyword/orm) required. Change databases or store data in multiple databases using the same schemas. For example, session data in Redis, permanent data in MongoDB.
* JSON Schema has a really nice declarative syntax. See the [official examples](http://json-schema.org/examples.html).

## API

### JaySchema([loader])

**(Constructor)** The optional *loader* will be called each time an external `$ref` is encountered. It should load the referenced schema and return it.

If you don’t reference any external schemas, or if you pre-register all the schemas you’re using, you don’t need to provide a *loader*.

**If you provide a *loader*, you should call the validate() function asynchronously.** That’s because loading involves disk or network I/O, and I/O operations in Node are asynchronous.

Sample loader skeleton:

```js
function loader(ref, callback) {
    // ref is the schema to load
    // [ load your schema! ]
    if (errorOccurred) {
        callback(err);
    } else {      
        callback(null, schema);
    }
}
```

### JaySchema.prototype.validate(instance, schema [, callback])

Validate a JSON object, *instance*, against the given *schema*. If you provide a *callback*, validation will be done asynchronously.

*schema* can be an actual JSON Schema (a JSON object), or it can be the `id` of a previously-registered schema (a string).

#### Return value

* **async:** Uses the standard Node callback signature. The first argument will be an array of errors, if any errors occurred, or `undefined` on success.
* **synchronous:** If you don’t provide a callback, an array of errors will be returned. Success is indicated by an empty array.

### JaySchema.prototype.register(schema [, id])

Manually register *schema*. Useful if you have several related schemas you are working with. The optional *id* can be used to register a schema that doesn’t have an `id` property, or which is referenced using a unique id.

**Returns:** an array of missing schemas. A missing schema is one that was `$ref`erenced by the registered schema, but hasn’t been regisetered yet. If no missing schemas were referenced, an empty array is returned.

See [Schema loading](#schema-loading).

### JaySchema.prototype.getMissingSchemas()

Returns an array of missing schemas. A missing schema is one that was `$ref`erenced by a `register()`ed schema, but the referenced schema has not yet been loaded.

See [Schema loading](#schema-loading).

### JaySchema.prototype.isRegistered(id)

Return boolean indicating whether the specified schema id has previously been registered.

See [Schema loading](#schema-loading).

### Loaders

A loader can be passed to the constructor, or you can set the `loader` property at any time. You can define your own loader. **JaySchema** also includes one built-in loader for your convenience:

#### JaySchema.loaders.http

Loads external `$ref`s using HTTP. :warning: **Caveat:** HTTP is inherently unreliable. For example, the network or site may be down, or the referenced schema may not be available any more. You really shouldn’t use this in production, but it’s great for testing.

### Configuration options

### maxRecursion

The maximum depth to recurse when retrieving external `$ref` schemas using a loader. The default is `5`.

### loader

The schema loader to use, if any. (The same schema loader that was passed to the `JaySchema` constructor.) You can change or override this at any time.

## Schema loading

**JaySchema** provides several ways to register externally-referenced schemas.

You use the `$ref` keyword to pull in an external schema. For example, you might reference a schema that’s available in a local database.

Validation will fail if **JaySchema** encounters a validation rule that references an external schema, if that schema is not `register`ed.

There are several ways to ensure that all referenced schemas are registered:

### Using a loader

Pass a `loader` callback to the `JaySchema` constructor. When an external schema is needed, **JaySchema** will call your loader. See the constructor documentation, above. Using a loader requires you to validate asynchronously.

### By using the `getMissingSchemas()` method

This works with synchronous or async code.

1. First, `register()` the main schemas you plan to use.
2. Next, call `getMissingSchemas`, which returns an array of externally-referenced schemas. 
3. Retrieve and `register()` each missing schema.
4. Repeat from step 2 until there are no more missing schemas.

### By using the `register()` return value

This works with synchronous or async code.

Each time you call `register(schema)`, the return value will be an array of missing external schemas that were referenced. You can use this to register the missing schemas.

In other words: calling `register(schemaA);` will (1) register `schemaA` and (2) return a list of missing schemas that were referenced by `schemaA`.

If, instead, you want the list of *all* missing schemas referenced by all registrations that have been done so far, use the `getMissingSchemas()` method, above.

## Format specifiers

**JaySchema** supports the following values for the optional `format` keyword:

* `date-time`: Must match the `date-time` specification given in [RFC 3339, Section 5.6](https://tools.ietf.org/html/rfc3339#section-5.6). This expects *both* a date and a time. For date-only validation or time-only validation, JaySchema supports the older draft v3 `date` and `time` formats.
* `hostname`: Must match the “Preferred name syntax” given in [RFC 1034, Section 3.5](https://tools.ietf.org/html/rfc1034#section-3.5), with the exception that hostnames are permitted to begin with a digit, as per [RFC 1123 Section 2.1](http://tools.ietf.org/html/rfc1123#section-2.1).
* `email`: Must match [RFC 5322, Section 3.4.1](https://tools.ietf.org/html/rfc5322#section-3.4.1), with the following limitations: `quoted-string`s, `domain-literal`s, comments, and folding whitespace are not supported; the `domain` portion must be a hostname as in the `hostname` keyword.
* `ipv4`: Must be a dotted-quad IPv4 address.
* `ipv6`: Must be a valid IPv6 address as per [RFC 2373 section 2.2](http://tools.ietf.org/html/rfc2373#section-2.2).
* `uri`: As in [RFC 3986 Appendix A](http://tools.ietf.org/html/rfc3986#appendix-A), including relative URIs (no scheme part, fragment-only), with the exception that well-formedness of internal elements, including percent encoding and authority strings, is not verified.
