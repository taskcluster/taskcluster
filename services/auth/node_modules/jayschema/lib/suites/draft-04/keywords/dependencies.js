// ******************************************************************
// § 5.4. Validation keywords for objects
// ******************************************************************

var Errors = require('../../../errors.js')
  , testRunner = require('../index.js')
  ;

module.exports = function(config) {
  var errors = [];
  var i, prop, len;

  var deps = Object.keys(config.schema.dependencies);

  var depsToApply = [];
  for (i = 0, len = deps.length; i !== len; ++i) {
    prop = deps[i];
    if (Object.prototype.hasOwnProperty.call(config.inst, prop)) {
      depsToApply.push(prop);
    }
  }

  for (var index = 0; index < depsToApply.length; ++index) {
    var key = depsToApply[index];
    var dep = config.schema.dependencies[key];

    if (Array.isArray(dep)) {
      // property dependency
      var missing = [];
      for (i = 0, len = dep.length; i !== len; ++i) {
        prop = dep[i];
        if (!Object.prototype.hasOwnProperty.call(config.inst, prop)) {
          missing.push(prop);
        }
      }

      if (missing.length) {
        errors.push(new Errors.ObjectValidationError(config.resolutionScope,
          config.instanceContext, 'dependencies', {key: dep}, null,
          'missing: ' + missing));
      }
    } else {
      // schema dependency: validates the *instance*, not the value
      // associated with the property name.
      var subTestConfig = {
        inst: config.inst,
        schema: dep,
        resolutionScope: config.resolutionScope + '/dependencies/' + index,
        instanceContext: config.instanceContext + '/' + key,
        schemaRegistry: config.schemaRegistry
      };
      errors = errors.concat(testRunner(subTestConfig));
    }
  }

  return errors;
};
