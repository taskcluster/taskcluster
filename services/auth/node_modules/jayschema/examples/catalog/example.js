//
// Example showing how to validate the "Product Set" schema shown in
// http://json-schema.org/example1.html.
//

var JaySchema = require('../../lib/jayschema.js')
  ;

// Load the schema and the data to be validated
var schema = require('./productSet-schema.json');
var data = require('./data.json');

// Create the JaySchema object
var js = new JaySchema();

// Register our schema
//
// If you are just using one schema, you don't have to do this, but
// it's useful, because it will let us know about any missing
// referenced schemas.

var missingSchemas = js.register(schema);

if (missingSchemas.length) {
  // It turns out the productSet schema references a remote schema,
  // with an id of "http://json-schema.org/geo". We have to load and
  // register that.
  //
  // We have a few of options. (A) We could load it here by any
  // means and register() it. (B) We could write our own loader
  // callback that will be called by JaySchema when it encounters a
  // missing schema. (C) Because this schema has an HTTP id, We can
  // do it the easy way and use JaySchema's built-in HTTP loader.
  //
  // Here is the easy way:
  js.loader = JaySchema.loaders.http;
}

// Okay, let's validate, asynchronously.
js.validate(data, schema, function(errs) {
  if (errs) { console.error('validation errors:\n', errs); }
  else { console.log('no validation errors!'); }
});
