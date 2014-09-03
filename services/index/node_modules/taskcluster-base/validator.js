var debug       = require('debug')('base:validator');
var jjv         = require('jjv');
var fs          = require('fs');
var request     = require('superagent-promise');
var _           = require('lodash');
var aws         = require('aws-sdk-promise');
var Promise     = require('promise');
var assert      = require('assert');
var path        = require('path');
var yaml        = require('js-yaml');

var utils       = require('./utils');


/** Render {$const: <key>} into JSON schema */
var render = function(schema, constants) {
  // Replace val with constant, if it is an {$const: <key>} schema
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
  // Do a deep clone with substitute
  return _.cloneDeep(schema, substitute);
};

// Slightly modified version of the regular expression from RFC 3986, Appx B,
// See: http://tools.ietf.org/html/rfc3986#appendix-B
// This regular expression is designed for parsing. So it won't catch many
// errors. A more elaborate work is available here:
//    http://jmrware.com/articles/2009/uri_regexp/URI_regex.html
// but license information is absent.
var URI_REGEXP = /^(([^:\/?#]+):)(\/\/([^/?#]*))?([^?#]*)(\?([^#]*))?(#(.*))?$/;

/** Validator wrapper class, with auxiliary methods */
var Validator = function(schemas) {
  // Create validation environment
  this._env = new jjv();

  // Use modify input by applying default values, if no value is provided
  this._env.defaultOptions.useDefault = true;

  // Validate "format: uri" using our custom regular expression, otherwise it
  // won't support localhost.
  this._env.addFormat('uri', function (v) {
    return URI_REGEXP.test(v);
  });

  // Load all schema given to constructor
  var that = this;
  (schemas || []).forEach(function(schema) {
    that.register(schema);
  });
};

/** Validate a JSON object given a schema identifier
 * return null if there is no errors and list of errors if we have errors.
 *
 * For a decent introduction to JSON schemas see:
 * http://spacetelescope.github.io/understanding-json-schema
 */
Validator.prototype.check = function(json, schema) {
  // Validate json
  var errors = this._env.validate(schema, json);

  // If there are no errors return null, this is better in an if-statement
  if (!errors) {
    return null;
  }
  return errors;
};

/** Load schema from URL, return a promise of success */
Validator.prototype.load = function(url) {
  var that = this;
  return request
  .get(url)
  .end()
  .then(function(res) {
    if (!res.ok) {
      debug("Failed to load schema from: " + url);
      throw new Error("Failed to load from URL: " + url);
    }
    debug("Loaded: %s", url);
    that.register(res.body);
  });
};

/** Register JSON schema with the validator */
Validator.prototype.register = function(schema) {
  this._env.addSchema(schema);
};

/**
 * Return promise that a validator will be created.
 *
 * options:
 * {
 *   folder:    path.join(__dirname, 'schemas'),  // Folder to load schemas from
 *   constants: {"CONSTANT": "value"},            // Constants to substitute in
 *   publish:           true,                     // Publish schemas from folder
 *   schemaPrefix:      'queue/v1/'               // Prefix within S3 bucket
 *   schemaBucket:      'schemas.taskcluster.net',// Schema publication bucket
 *   aws: {             // AWS credentials and region for schemaBucket
 *    accessKeyId:        '...',
 *    secretAccessKey:    '...',
 *    region:             'us-west-2'
 *   },
 *   preload:   ['http://domain.com/schema.json'] // List of schema-urls to load
 * }
 */
var validator = function(options) {
  // Provide default options
  options = _.defaults(options || {}, {
    schemaBucket:    'schemas.taskcluster.net'
  });

  // Create validator
  var validator = new Validator();

  // Data for publication, if needed
  var schemasLoaded = [];

  // Load schemas from folder
  if (options.folder) {
    // Register JSON schemas from folder
    utils.listFolder(options.folder).forEach(function(filePath) {
      // We shall only import JSON files
      if (!/\.(json|ya?ml)$/.test(filePath)) {
        return;
      }
      try {
        // Load data from file
        var data = fs.readFileSync(filePath, {encoding: 'utf-8'});

        // Parse file to JSON
        var json = null;
        if (/\.ya?ml$/.test(filePath)) {
          // Parse yaml file
          json = yaml.safeLoad(data);
        } else {
          // Parse JSON file
          json = JSON.parse(data);
        }

        // Render JSON to JSON Schema, by substituting constants
        var schema = render(json, options.constants || {});

        // Register with the validator
        validator.register(schema);

        // Find relative path and use it as name
        var name = path.relative(options.folder, filePath);

        // Replace .yaml and .yml with .json
        name = name.replace(/\.ya?ml$/, '.json');

        // Log that we loaded schema
        debug("Loaded: %s", filePath);

        // Schemas loaded from folder maybe published later
        schemasLoaded.push({
          name:     name,
          schema:   schema
        });
      }
      catch(error) {
        debug("Failed to load schema: %s", filePath);
        throw error;
      }
    });
  }

  // Promises to wait for
  var promises = [];

  // Check if we should publish
  if (options.publish) {
    assert(options.aws,          "Can't publish without aws credentials");
    assert(options.schemaPrefix, "Can't publish without schemaPrefix");
    assert(options.schemaPrefix == "" || /.+\/$/.test(options.schemaPrefix),
           "schemaPrefix must be empty or should end with a slash");
    // Publish schemas to S3
    var s3 = new aws.S3(options.aws);
    promises = promises.concat(schemasLoaded.map(function(entry) {
      debug("Publishing: %s", entry.name);
      return s3.putObject({
        Bucket:           options.schemaBucket,
        Key:              options.schemaPrefix + entry.name,
        Body:             JSON.stringify(entry.schema, undefined, 4),
        ContentType:      'application/json'
      }).promise().catch(function(err) {
        debug("Failed to publish: %s", entry.name);
        throw err;
      });
    }));
  }

  // Load all schemas we're requested to preload
  promises = promises.concat((options.preload || []).map(function(url) {
    return validator.load(url);
  }));

  // Promise that all promises finish
  return Promise.all(promises).then(function() {
    return validator;
  });
};

// Export method to load validator Validator
module.exports = validator;

// Export validator class
validator.Validator = Validator;
Validator.render    = render;
