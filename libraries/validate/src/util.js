const debug = require('debug')('taskcluster-lib-validate');
const _ = require('lodash');
const url = require('url');
const libUrls = require('taskcluster-lib-urls');

/** 
 * Render {$const: <key>} into JSON schema and update $ref
 */
function renderConstants(schema, constants) {
  // Replace val with constant, if it is an {$const: <key>} schema
  let substitute = (val) => {
    // Primitives and arrays shouldn't event be considered
    if (!(val instanceof Object) || val instanceof Array) {
      return undefined;
    }

    // Check if there is a key and only one key
    let key = val.$const;
    if (key === undefined || typeof key != 'string' || _.keys(val).length != 1) {
      return undefined;
    }

    // Check that there's a constant for the key
    let constant = constants[key];
    if (constant === undefined) {
      throw new Error('Warning! Undefined constant: ' + key);
    }

    // Clone constant
    return _.cloneDeepWith(constants[key], substitute);
  };
  // Do a deep clone with substitute
  return _.cloneDeepWith(schema, substitute);
}

exports.renderConstants = renderConstants;

/**
 * Check that all use of $ref in this schema is relative.  Note that this
 * isn't foolproof: it will allow {$ref: '../../otherservice/v1/someschema.json'}.
 * But this is enough to dissuade users from inter-service linking.
 */
const checkRefs = (schema, serviceName) => {
  const check = val => {
    if (_.isObject(val)) {
      if (typeof val.$ref === 'string' && _.keys(val).length == 1) {
        const ref = url.parse(val.$ref);
        if (ref.hostname || ref.protocol) {
          throw new Error(`Disallowed $ref '${ref}': absolute URIs are not allowed`);
        }
        if (ref.path && ref.path.startsWith('/')) {
          throw new Error(`Disallowed $ref '${ref}': rooted URIs (starting with /) are not allowed`);
        }
        return;
      }

      _.values(val).forEach(check);
      return;
    }

    if (_.isArray(val)) {
      val.forEach(check);
      return;
    }
  };
  check(schema);
};

exports.checkRefs = checkRefs;
