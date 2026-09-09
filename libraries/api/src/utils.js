import { parse } from 'path-to-regexp';

/**
 * Parse a route into its reference form and its parameters.
 *
 * `route` is the input route rewritten to use `<..>` syntax for the parameters.
 * `params` is the full list of parameters, `optionalParams` those that may be
 * absent from the path, and `splatParams` those that match the rest of the
 * path, including slashes.
 *
 * @param {string} route
 * @returns {{ route: string, params: string[], optionalParams: string[], splatParams: string[] }}
 */
export const cleanRouteAndParams = route => {
  // Find parameters for entry
  /** @type {string[]} */
  const params = [];
  /** @type {string[]} */
  const optionalParams = [];
  /** @type {string[]} */
  const splatParams = [];

  // express parses routes with path-to-regexp. See
  // https://github.com/pillarjs/path-to-regexp/tree/v8.4.2
  const walk = (tokens, inGroup) =>
    tokens
      .map(token => {
        if (token.type === 'text') {
          return token.value;
        }
        if (token.type === 'group') {
          return walk(token.tokens, true);
        }
        params.push(token.name);
        if (token.type === 'wildcard') {
          splatParams.push(token.name);
        } else if (inGroup) {
          optionalParams.push(token.name);
        }
        return `<${token.name}>`;
      })
      .join('');

  return { route: walk(parse(route).tokens, false), params, optionalParams, splatParams };
};
