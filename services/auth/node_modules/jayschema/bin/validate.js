#!/usr/bin/env node

// simple command-line validation

var JaySchema = require('../lib/jayschema.js')
  , fs = require('fs')
  , path = require('path')
  ;

// support Node 0.6.x
var existsSync = fs.existsSync || path.existsSync;

var META_SCHEMA_PATH = path.join(__dirname, '..', 'lib', 'suites', 'draft-04',
  'json-schema-draft-v4.json');
var META_SCHEMA = require(META_SCHEMA_PATH);

var instance = process.argv[2];
var schema = process.argv[3] || META_SCHEMA_PATH;

var syntax = function() {
  console.log('Syntax: jayschema <instance> [<schema>]');
  console.log('\tif <schema> is omitted, the <instance> will be validated');
  console.log('\tagainst the JSON Schema Draft v4 meta-schema');
};

if (!instance || !schema) {
  return syntax();
}

if (!existsSync(instance)) {
  console.error('ERR: instance', '"' + instance + '"', 'not found');
  return;
}

if (!existsSync(schema)) {
  console.error('ERR: schema', '"' + schema + '"', 'not found');
  return;
}

var instanceRaw = fs.readFileSync(instance);
var schemaRaw = fs.readFileSync(schema);

try {
  var instanceJson = JSON.parse(instanceRaw);
} catch (e) {
  console.error('ERR: instance is not valid JSON');
  return;
}

try {
  var schemaJson = JSON.parse(schemaRaw);
} catch (e) {
  console.error('ERR: schema is not valid JSON');
  return;
}

var js = new JaySchema();

var schemaErrors = js.validate(schemaJson, META_SCHEMA);
if (schemaErrors.length) {
  console.error('ERR: schema is not valid JSON Schema Draft v4');
  console.log(require('util').inspect(schemaErrors, false, null));
  return;
}

var result = js.validate(instanceJson, schemaJson);

if (result.length === 0) {
  console.log('validation OK');
} else {
  console.log('validation errors:');
  console.log(require('util').inspect(result, false, null));
}
