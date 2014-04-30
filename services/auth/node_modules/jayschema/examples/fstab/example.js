//
// Example showing how to validate the "/etc/fstab" schema shown in
// http://json-schema.org/example2.html.
//

var JaySchema = require('../../lib/jayschema.js')
  , assert = require('assert')
  , util = require('util')
  ;

// Create the JaySchema object
var js = new JaySchema();

// Grab some sample data to validate
var data = require('./data.json');

// Get the main schema and the dependency "entry" schema
var schema = require('./fstab-schema.json');
var entrySchema = require('./entry-schema.json');

// Register the dependency schema
js.register(entrySchema);

// Okay, let's validate. Synchronously this time.
var errors = js.validate(data, schema);

if (errors.length) {
  console.error('validation errors:\n', util.inspect(errors, false, null));
}
else {
  console.log('no validation errors!');
}
