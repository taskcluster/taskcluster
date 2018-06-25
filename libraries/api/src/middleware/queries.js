const _ = require('lodash');

/**
 * Validate query-string against query.
 *
 * Query-string options not specified in options will not be allowed. But it's
 * optional if a request carries any query-string parameters at all.
 */
const queryValidator = ({context, entry}) => {
  const {query} = entry;

  return (req, res, next) => {
    const errors = [];
    _.forEach(req.query || {}, (value, key) => {
      const pattern = query[key];
      if (!pattern) {
        // Allow the bewit key, it's used in signed strings
        if (key !== 'bewit') {
          errors.push('Query-string parameter: ' + key + ' is not supported!');
        }
        return;
      }
      if (pattern instanceof RegExp) {
        if (!pattern.test(value)) {
          errors.push('Query-string parameter: ' + key + '="' + value +
                      '" does not match expression: ' + pattern.toString());
        }
      } else {
        const msg = pattern.call(context, value);
        if (typeof msg === 'string') {
          errors.push('Query-string parameter: ' + key + '="' + value +
                      '" is not valid, error: ' + msg);
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        errors.join('\n'),
        {errors}
      );
    }
    return next();
  };
};

exports.queryValidator = queryValidator;
