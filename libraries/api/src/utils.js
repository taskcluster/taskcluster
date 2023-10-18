/**
 * Return [route, params, optionalParams] from route.  `route` is the input
 * route rewritten to use `<..>` syntax for the parameters.  `params`
 * is the full list of parameters.  And `optionalParams` is the list of
 * parameters with a `?` suffix, making them optional.
 */
export const cleanRouteAndParams = (route) => {
  // Find parameters for entry
  const params = [];
  const optionalParams = [];
  // Note: express uses the NPM module path-to-regexp for parsing routes
  // when modifying this to support more complicated routes it can be
  // beneficial lookup the source of this module:
  // https://github.com/component/path-to-regexp/blob/0.1.x/index.js
  route = route.replace(/\/:(\w+)(\(.*?\))?\??/g, (match, param) => {
    params.push(param);
    if (match.endsWith('?')) {
      optionalParams.push(param);
    }
    return '/<' + param + '>';
  });
  return [route, params, optionalParams];
};
