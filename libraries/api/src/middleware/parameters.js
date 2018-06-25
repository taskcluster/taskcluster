const _ = require('lodash');
const assert = require('assert');

/**
 * Create parameter validation middle-ware instance, given a mapping from
 * parameter to regular expression or function that returns a message as string
 * if the parameter is invalid.
 *
 * Parameters not listed in `req.params` will be ignored. But parameters
 * present must match the pattern given in `options` or the request will be
 * rejected with a 400 error message.
 */
const parameterValidator = ({context, entry}) => {
  const {params} = entry;

  // Validate parameters
  _.forIn(params, (pattern, param) => {
    assert(pattern instanceof RegExp || pattern instanceof Function,
      'Pattern given for param: \'' + param + '\' must be a RegExp or ' +
           'a function');
  });
  return (req, res, next) => {
    const errors = [];
    _.forIn(req.params, (val, param) => {
      const pattern = params[param];
      if (pattern instanceof RegExp) {
        if (!pattern.test(val)) {
          errors.push(
            'URL parameter \'' + param + '\' given as \'' + val + '\' must match ' +
            'regular expression: \'' + pattern.toString() + '\''
          );
        }
      } else if (pattern instanceof Function) {
        const msg = pattern.call(context, val);
        if (typeof msg === 'string') {
          errors.push(
            'URL parameter \'' + param + '\' given  as \'' + val +  '\' is not ' +
            'valid: ' + msg
          );
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        'Invalid URL patterns:\n' + errors.join('\n'),
        {errors}
      );
    }
    return next();
  };
};

exports.parameterValidator = parameterValidator;
