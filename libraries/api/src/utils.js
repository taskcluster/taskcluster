/** Return [route, params] from route */
exports.cleanRouteAndParams = (route) => {
  // Find parameters for entry
  const params = [];
  // Note: express uses the NPM module path-to-regexp for parsing routes
  // when modifying this to support more complicated routes it can be
  // beneficial lookup the source of this module:
  // https://github.com/component/path-to-regexp/blob/0.1.x/index.js
  route = route.replace(/\/:(\w+)(\(.*?\))?\??/g, (match, param) => {
    params.push(param);
    return '/<' + param + '>';
  });
  return [route, params];
};
