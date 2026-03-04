import assert from 'assert';

/**
 * Create parameter validation middle-ware instance, given a mapping from
 * parameter to regular expression or function that returns a message as string
 * if the parameter is invalid.
 *
 * Parameters not listed in `req.params` will be ignored. But parameters
 * present must match the pattern given in `options` or the request will be
 * rejected with a 400 error message.
 *
 * @template {Record<string, any>} TContext
 * @param {{
 *   entry: import('../../@types/index.d.ts').APIEntryOptions<TContext>,
 * }} options
 * @returns {import('../../@types/index.d.ts').APIRequestHandler<TContext>}
 */
export const parameterValidator = ({ entry }) => {
  const { params = {} } = entry;

  // Validate parameters
  Object.keys(params).forEach(param => {
    assert(params[param] instanceof RegExp || params[param] instanceof Function,
      'Pattern given for param: \'' + param + '\' must be a RegExp or ' +
           'a function');
  });
  return (req, res, next) => {
    /** @type {string[]} */
    const errors = [];
    Object.entries(req.params).forEach(([param, val]) => {
      const pattern = params[param];
      if (pattern instanceof RegExp) {
        if (!pattern.test(val)) {
          errors.push(
            'URL parameter \'' + param + '\' given as \'' + val + '\' must match ' +
            'regular expression: \'' + pattern.toString() + '\'',
          );
        }
      } else if (pattern instanceof Function) {
        const msg = pattern.call(req.tcContext, val);
        if (typeof msg === 'string') {
          errors.push(
            'URL parameter \'' + param + '\' given  as \'' + val + '\' is not ' +
            'valid: ' + msg,
          );
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        'Invalid URL patterns:\n' + errors.join('\n'),
        { errors },
      );
    }
    return next();
  };
};
