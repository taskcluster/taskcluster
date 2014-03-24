var fs          = require('fs');
var path        = require('path');
var debug       = require('debug')('utils:render-schema');
var misc        = require('./misc');
var constants   = require('../schemas/constants');
var _           = require('lodash');
var mkdirp      = require('mkdirp');
var nconf       = require('nconf');
var aws         = require('aws-sdk-promise');
var Promise     = require('promise');

/** Replace val with constant, if it is an {$const: <key>} schema */
var substitute = function(val) {
  // Primitives and arrays shouldn't event be considered
  if (!(val instanceof Object) || val instanceof Array) {
    return undefined;
  }

  // Check if there is a key and only one key
  var key = val['$const'];
  if (key === undefined || typeof(key) != 'string' || _.keys(val).length != 1) {
    return undefined;
  }

  // Check that there's a constant for the key
  var constant = constants[key];
  if (constant === undefined) {
    return undefined;
  }

  // Clone constant
  return _.cloneDeep(constants[key], substitute);
};

/** Render {$const: <key>} into JSON schema */
var render = function(schema) {
  return _.cloneDeep(schema, substitute);
};

// Export the render function only
module.exports = render;

/** Publish schemas to schemas.taskcluster.net/ */
render.publish = function() {
  // Create AWS instance
  var s3 = new aws.S3();
  debug("Publishing schemas to S3");

  // Publish JSON schemas from folder
  var schema_folder = __dirname + '/../schemas/';
  var schemas = misc.listFolder(schema_folder);
  var all_published = schemas.map(function(filePath) {
    // We shall only render JSON files
    if (!/\.json/g.test(filePath)) {
      return;
    }
    try {
      // Load data from file
      var data = fs.readFileSync(filePath, {encoding: 'utf-8'});

      // Parse JSON
      var json = JSON.parse(data);

      // Render JSON to JSON Schema, by substituting constants
      var schema = render(json);

      // Path magic...
      var relPath = path.relative(schema_folder, filePath);

      // Publish schema to S3
      debug("Publishing: %s", relPath);
      return s3.putObject({
        Bucket:           nconf.get('queue:schemaBucket'),
        Key:              relPath,
        Body:             JSON.stringify(schema, undefined, 4),
        ContentType:      'application/json'
      }).promise();
    }
    catch(error) {
      debug("Failed to load schema: %s, error: %s", filePath, error);
      throw error;
    }
  });
  return Promise.all(all_published).then(function() {
    debug("All schemas published");
  }, function(err) {
    debug("Failed to publish schemas, error: %s, as JSON: %j", err, err);
    throw err;
  });
};

// This module is loaded as top-level module, we take output folder to which
// we should render schemas as input
if (!module.parent) {
  var output_folder = process.argv[2];

  // Output JSON schemas from folder
  var schema_folder = __dirname + '/../schemas/';
  var schemas = misc.listFolder(schema_folder);
  schemas.forEach(function(filePath) {
    // We shall only render JSON files
    if (!/\.json/g.test(filePath)) {
      return;
    }
    try {
      // Load data from file
      var data = fs.readFileSync(filePath, {encoding: 'utf-8'});

      // Parse JSON
      var json = JSON.parse(data);

      // Render JSON to JSON Schema, by substituting constants
      var schema = render(json);

      // Render the schema to JSON string again
      var data = JSON.stringify(schema, undefined, 4);

      // Path magic...
      var relPath = path.relative(schema_folder, filePath);
      var outPath = path.join(output_folder, relPath);
      var outDir  = path.dirname(outPath);

      // Ensure output folder
      mkdirp.sync(outDir)

      // Write rendered schema
      fs.writeFileSync(outPath, data, {encoding: 'utf-8'});

      console.log(" - " + outPath);

      debug("Rendered: %s", filePath);
    }
    catch(error) {
      debug("Failed to load schema: %s", filePath);
      throw error;
    }
  });
}


