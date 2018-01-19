const scopes = require('taskcluster-lib-scopes');
const _ = require('lodash');

/**
 * Given a string, potentially with parameters included (indicated by <...>) and
 * a set of parameters, return a new string that has replaced the parameters in the string
 * with the value of the parameter in the parameters object. The third argument is a list
 * that will have the names of any missing parameters appended to it.
 *
 * Example:
 *
 * splatParams('abc:<foo>:<bar>', {foo: 'def', bar: 'ghi'}, []) -> 'abc:def:ghi'
 *
 */
export const splatParams = (scope, params, missing) => scope.replace(/<([^>]+)>/g, (match, param) => {
  const value = _.at(params, param)[0];
  if (value !== undefined) {
    return value;
  }
  missing.push(match); // If any are left undefined, we can't be done yet
  return match;
});

/**
 * Given a scope expression template and a set of params, return a valid
 * scope expression after rendering the template in the method described in the documentation
 * for `req.authorize()` in `src/api.js`. The third parameter is a list that will have any
 * missing parameters appended to it. Returns null only in the case that an if/then expression
 * is the template and it is false.
 */
export const expandExpressionTemplate = (template, params, missing) => {
  if (typeof template === 'string') {
    return splatParams(template, params, missing);
  } else if (_.isObject(template) && template.for && template.in && template.each) {
    let subs = _.at(params, template.in)[0];
    if (!subs) {
      missing.push(template.in);
      return null;
    }
    return subs.map(param => splatParams(template.each.replace(`<${template.for}>`, param), params, missing));
  } else if (_.isObject(template) && template.if && template.then) {
    const conditional = _.at(params, template.if)[0];
    if (conditional === true) {
      // Only do this if the conditional exists and is literally true
      return expandExpressionTemplate(template.then, params, missing);
    } else if (conditional === undefined) {
      // In the case that the conditional is false, do nothing. If it is missing, we say so
      missing.push(template.if);
    } else if (conditional !== false) {
      throw new error(`conditional values must be booleans! ${template.if} is a ${typeof template.if}`);
    } else {
      return null;
    }
  } else {
    let subexpressions = [];
    if (template.AnyOf) {
      template.AnyOf.forEach(scope => {
        const results = expandExpressionTemplate(scope, params, missing);
        if (results) {
          subexpressions = subexpressions.concat(results);
        }
      });
      return {AnyOf: subexpressions};
    }
    template.AllOf.forEach(scope => {
      const results = expandExpressionTemplate(scope, params, missing);
      if (results) {
        subexpressions = subexpressions.concat(results);
      }
    });
    return {AllOf: subexpressions};
  }
};
