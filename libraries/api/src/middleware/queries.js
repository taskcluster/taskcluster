/**
 * Validate query-string against query.
 *
 * Query-string options not specified in options will not be allowed. But it's
 * optional if a request carries any query-string parameters at all.
 *
 * @template {Record<string, any>} TContext
 * @param {{
 *   entry: import('../../@types/index.d.ts').APIEntryOptions<TContext>,
 * }} options
 * @returns {import('../../@types/index.d.ts').APIRequestHandler<TContext>}
 */
export const queryValidator = ({ entry }) => {
  const { query = {} } = entry;

  return (req, res, next) => {
    /** @type {string[]} */
    const errors = [];
    Object.entries(req.query || {}).forEach(([key, value]) => {
      const pattern = query[key];
      if (!pattern) {
        // Allow the bewit key, it's used in signed strings
        if (key !== 'bewit') {
          errors.push('Query-string parameter: ' + key + ' is not supported!');
        }
        return;
      }
      if (typeof value !== 'string') {
        errors.push('Query-string parameter: ' + key + ' must be a string!');
        return;
      }
      if (pattern instanceof RegExp) {
        if (!pattern.test(value)) {
          delete req.query[key];
          errors.push('Query-string parameter: ' + key + '="' + value +
                      '" does not match expression: ' + pattern.toString());
        }
      } else {
        const msg = pattern.call(req.tcContext, value);
        if (typeof msg === 'string') {
          delete req.query[key];
          errors.push('Query-string parameter: ' + key + '="' + value +
                      '" is not valid, error: ' + msg);
        }
      }
    });
    if (errors.length > 0) {
      return res.reportError(
        'InvalidRequestArguments',
        errors.join('\n'),
        { errors },
      );
    }
    return next();
  };
};
