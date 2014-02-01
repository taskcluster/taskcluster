var debug       = require('debug')('utils:validate');
var JaySchema   = require('jayschema');
var fs          = require('fs');
var misc        = require('./misc');

var validator = null;

/** Create validator and load schemas */
var setup = function() {
  // Create validator
  validator = new JaySchema();

  // Register JSON schemas from folder
  var schemas = misc.listFolder(__dirname + '/../schemas/');
  schemas.forEach(function(filePath) {
    try {
      var data = fs.readFileSync(filePath, {encoding: 'utf-8'});
      var schema = JSON.parse(data);
      validator.register(schema);
      debug("Loaded: %s", filePath);
    }
    catch(error) {
      debug("Failed to load schema: %s", filePath);
      throw error;
    }
  });
};

/** Validate a JSON object given a schema identifier
 * return null if there is no errors and list of errors if we have errors.
 *
 * For a decent introduction to JSON schemas see:
 * http://spacetelescope.github.io/understanding-json-schema
 */
module.exports = function(json, schema) {
  // Lazy load schemas
  if (validator === null) {
    setup();
  }

  // Validate json
  var errors = validator.validate(json, schema);

  // If there are no errors return null, this is better in an if-statement
  if (errors.length == 0) {
    return null;
  }
  return errors;
};
