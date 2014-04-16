var debug       = require('debug')('utils:validate');
var JaySchema   = require('jayschema');
var fs          = require('fs');
var misc        = require('./misc');
var render      = require('./render-schema');
var Promise     = require('promise');
var request     = require('superagent')

var validator = null;

/** Create validator and load schemas, returns a promise of success */
var setup = function() {
  // Return immediately if already loaded
  if(validator) {
    return Promise.from(undefined);
  }

  // Create validator
  validator = new JaySchema();

  // Register JSON schemas from folder
  var schemas = misc.listFolder(__dirname + '/../schemas/');
  schemas.forEach(function(filePath) {
    // We shall only import JSON files
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

      // Register with the validator
      validator.register(schema);
      debug("Loaded: %s", filePath);
    }
    catch(error) {
      debug("Failed to load schema: %s", filePath);
      throw error;
    }
  });

  // Load all schemas that need to be loaded from remote source
  return Promise.all([
    'http://schemas.taskcluster.net/queue/v1/task.json'
  ].map(function(schemaUrl) {
    return new Promise(function(accept, reject) {
      request
        .get(schemaUrl)
        .end(function(res) {
          if(!res.ok) {
            return reject(new Error("Failed to load " + schemaUrl));
          }
          validator.register(res.body);
          accept();
        });
    });
  }));
};

/** Validate a JSON object given a schema identifier
 * return null if there is no errors and list of errors if we have errors.
 *
 * For a decent introduction to JSON schemas see:
 * http://spacetelescope.github.io/understanding-json-schema
 */
var validate = function(json, schema) {
  // Check validator is loaded
  if (validator === null) {
    throw new Error("Validator is not loaded, call validate.setup() first!");
  }

  // Validate json
  var errors = validator.validate(json, schema);

  // If there are no errors return null, this is better in an if-statement
  if (errors.length == 0) {
    return null;
  }
  return errors;
};


// Export validate and setup
module.exports = validate;
validate.setup = setup;
