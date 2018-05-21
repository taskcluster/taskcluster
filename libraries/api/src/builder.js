const Debug = require('debug');
const assert = require('assert');
const _ = require('lodash');
const errors = require('./errors');
const ScopeExpressionTemplate = require('./expressions');
const API = require('./api');

var debug = Debug('api');

/**
 * Create an APIBuilder; see README for syntax
 */
var APIBuilder = function(options) {
  assert(!options.schemaPrefix, 'schemaPrefix is no longer allowed!');
  ['title', 'description', 'serviceName', 'version'].forEach(function(key) {
    assert(options[key], 'Option \'' + key + '\' must be provided');
  });
  assert(/^[a-z][a-z0-9_-]*$/.test(options.serviceName), `api serviceName "${options.serviceName}" is not valid`);
  assert(/^v[0-9]+$/.test(options.version), `api version "${options.version}" is not valid`);
  options = _.defaults({
    errorCodes: _.defaults({}, options.errorCodes || {}, errors.ERROR_CODES),
  }, options, {
    params:         {},
    context:        [],
    errorCodes:     {},
  });
  _.forEach(options.errorCodes, (value, key) => {
    assert(/[A-Z][A-Za-z0-9]*/.test(key), 'Invalid error code: ' + key);
    assert(typeof value === 'number', 'Expected HTTP status code to be int');
  });
  this.serviceName = options.serviceName;
  this.version = options.version;
  this.title = options.title;
  this.description = options.description;
  this.params = options.params;
  this.context = options.context;
  this.errorCodes = options.errorCodes;
  this.entries = [];
};

/** Stability levels offered by API method */
var stability = {
  /**
   * API has been marked for deprecation and should not be used in new clients.
   *
   * Note, documentation string for a deprecated API end-point should outline
   * the deprecation strategy.
   */
  deprecated:       'deprecated',
  /**
   * Unless otherwise stated API may change and resources may be deleted
   * without warning. Often we will, however, try to deprecate the API first
   * and keep around as `deprecated`.
   *
   * **Intended Usage:**
   *  - Prototype API end-points,
   *  - API end-points intended displaying unimportant state.
   *    (e.g. API to fetch state from a provisioner)
   *  - Prototypes used in non-critical production by third parties,
   *  - API end-points of little public interest,
   *    (e.g. API to define workerTypes for a provisioner)
   *
   * Generally, this is a good stability levels for anything under-development,
   * or when we know that there is a limited number of consumers so fixing
   * the world after breaking the API is easy.
   */
  experimental:     'experimental',
  /**
   * API is stable and we will not delete resources or break the API suddenly.
   * As a guideline we will always facilitate gradual migration if we change
   * a stable API.
   *
   * **Intended Usage:**
   *  - API end-points used in critical production.
   *  - APIs so widely used that refactoring would be hard.
   */
  stable:           'stable',
};

// List of valid stability-levels
var STABILITY_LEVELS = _.values(stability);
APIBuilder.stability = stability;

/**
 * Declare an API end-point entry, where options is on the following form:
 *
 * {
 *   method:   'post|head|put|get|delete',
 *   route:    '/object/:id/action/:param',      // URL pattern with parameters
 *   params: {                                   // Patterns for URL params
 *     param: /.../,                             // Reg-exp pattern
 *     id(val) { return "..." }                  // Function, returns message
 *                                               // if value is invalid
 *     // The `params` option from new API(), will be used as fall-back
 *   },
 *   query: {                                    // Query-string parameters
 *     offset: /.../,                            // Reg-exp pattern
 *     limit(n) { return "..." }                 // Function, returns message
 *                                               // if value is invalid
 *     // Query-string options are always optional (at-least in this iteration)
 *   },
 *   name:     'identifierForLibraries',         // identifier for client libraries
 *   stability: base.API.stability.experimental, // API stability level
 *   scopes:   ['admin', 'superuser'],           // Scopes for the request
 *   scopes:   [['admin'], ['per1', 'per2']],    // Scopes in disjunctive form
 *                                               // admin OR (per1 AND per2)
 *   input:    'input-schema.json',              // optional, null if no input
 *   output:   'output-schema.json' || 'blob',   // optional, null if no output
 *   skipInputValidation:    true,               // defaults to false
 *   skipOutputValidation:   true,               // defaults to false
 *   title:     "My API Method",
 *   noPublish: true                             // defaults to false, causes
 *                                               // endpoint to be left out of api
 *                                               // references
 *   description: [
 *     "Description of method in markdown, enjoy"
 *   ].join('\n'),
 *   cleanPayload: payload => payload,           // function to 'clean' the payload for
 *                                               // error messages (e.g., remove secrets)
 * }
 *
 * The handler parameter is a normal connect/express request handler, it should
 * return JSON replies with `request.reply(json)` and errors with
 * `request.json(code, json)`, as `request.reply` may be validated against the
 * declared output schema.
 *
 * **Note** the handler may return a promise, if this promise fails we will
 * log the error and return an error message. If the promise is successful,
 * nothing happens.
 */
APIBuilder.prototype.declare = function(options, handler) {
  ['name', 'method', 'route', 'title', 'description'].forEach(function(key) {
    assert(options[key], 'Option \'' + key + '\' must be provided');
  });
  // Default to experimental API end-points
  if (!options.stability) {
    options.stability = stability.experimental;
  }
  assert(STABILITY_LEVELS.indexOf(options.stability) !== -1,
    'options.stability must be a valid stability-level, ' +
         'see base.API.stability for valid options');
  options.params = _.defaults({}, options.params || {}, this.params);
  options.query = options.query || {};
  _.forEach(options.query, (value, key) => {
    if (!(value instanceof RegExp || value instanceof Function)) {
      throw new Error('query.' + key + ' must be a RegExp or a function!');
    }
  });
  assert(!options.deferAuth,
    'deferAuth is deprecated! https://github.com/taskcluster/taskcluster-lib-api#request-handlers');
  if (options.scopes && !ScopeExpressionTemplate.validate(options.scopes)) {
    throw new Error(`Invalid scope expression template: ${JSON.stringify(options.scopes, null, 2)}`);
  }
  options.handler = handler;
  if (this.entries.filter(entry => entry.route == options.route && entry.method == options.method).length > 0) {
    throw new Error('Identical route and method declaration.');
  }
  if (this.entries.some(entry => entry.name === options.name)) {
    throw new Error('This function has already been declared.');
  }
  this.entries.push(options);
};

/**
 * Build an API, optionally publishing to S3.
 */
APIBuilder.prototype.build = async function(options) {
  options.builder = this;
  const service = new API(options);
  if (options.publish) {
    await service.publish();
  }
  return service;
};

// Export APIBuilder
module.exports = APIBuilder;
