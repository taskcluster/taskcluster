import { cleanRouteAndParams } from '../utils.js';

/**
 * This is a shim to tranform wildcard route parameters back to a `/` separated
 * string since this is what route consumers want. Wildcards written as
 * `/{*name}` also match the empty string, in which case express omits the
 * parameter entirely. Those are restored as `""`.
 *
 * @template {Record<string, any>} TContext
 * @param {{
 *   entry: import('../../@types/index.d.ts').APIEntryOptions<TContext>,
 * }} options
 * @returns {import('express').RequestHandler}
 */
export const flattenParams = ({ entry }) => {
  const { splatParams } = cleanRouteAndParams(entry.route);

  return (req, _res, next) => {
    for (const name of splatParams) {
      const val = req.params[name];
      req.params[name] = Array.isArray(val) ? val.join('/') : (val ?? '');
    }
    next();
  };
};
