const _ = require('lodash');

const validRootTemplate = (template) =>
  validateTemplate(template) && (
    typeof template === 'string' ||
    template.hasOwnProperty('AllOf') ||
    template.hasOwnProperty('AnyOf') ||
    template.hasOwnProperty('if')
  )
;

/** Validate a scope expression template */
const validateTemplate = (template) => {
  if (typeof template === 'string') {
    return true;
  }
  const keys = _.keys(template);
  if (_.xor(keys, ['AllOf']).length === 0) {
    return template.AllOf.every(validateTemplate);
  }
  if (_.xor(keys, ['AnyOf']).length === 0) {
    return template.AnyOf.every(validateTemplate);
  }
  const paramPattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
  if (_.xor(keys, ['for', 'in', 'each']).length === 0) {
    return (
      paramPattern.test(template.for) &&
      paramPattern.test(template.in) &&
      validateTemplate(template.each) &&
      typeof template.each === 'string' // Remove to generalize if we want to some day
    );
  }
  if (_.xor(keys, ['if', 'then']).length === 0) {
    return paramPattern.test(template.if) && validRootTemplate(template.then);
  }
  if (_.xor(keys, ['if', 'then', 'else']).length === 0) {
    return (
      paramPattern.test(template.if) &&
      validRootTemplate(template.then) &&
      validRootTemplate(template.else)
    );
  }
  return false;
};

/**
 * Transform scope expression template to an intermediate-form where strings
 * are replaced with arrays, where-in all the even entries are paramters.
 */
const compileTemplate = (template) => {
  if (typeof template === 'string') {
    // All the even entries are parameters
    return template.split(/<([a-zA-Z][a-zA-Z0-9_]*)>/g);
  }
  if (template.hasOwnProperty('AllOf')) {
    return {AllOf: template.AllOf.map(compileTemplate)};
  }
  if (template.hasOwnProperty('AnyOf')) {
    return {AnyOf: template.AnyOf.map(compileTemplate)};
  }
  if (template.hasOwnProperty('for')) {
    return {
      for: template.for,
      in: template.in,
      each: compileTemplate(template.each),
    };
  }
  if (template.hasOwnProperty('if')) {
    if (!template.hasOwnProperty('else')) {
      return {
        if:   template.if,
        then: compileTemplate(template.then),
      };
    }
    return {
      if:   template.if,
      then: compileTemplate(template.then),
      else: compileTemplate(template.else),
    };
  }
  throw new Error('compileTemplate expects valid scope expression templates');
};

const mergeParams = (paramsA, paramsB = {}) => {
  const params = Object.assign({}, paramsA);
  for (const [p, T] of Object.entries(paramsB)) {
    if (params[p] && params[p] !== T) {
      throw new Error(`Parameter ${p} cannot be both '${T}' and '${params[p]}'`);
    }
    params[p] = T;
  }
  return params;
};

/**
 * Extract parameters from a compiled scope expression template
 *
 * Returns an object {'<param>': '<type>'}, where type is one of:
 *  - `string`,
 *  - `boolean`, or
 *  - `array` meaning array of strings.
 */
const extractParams = (compiledTemplate) => {
  const ctmpl = compiledTemplate;
  if (ctmpl instanceof Array) {
    return ctmpl
      .filter((value, i) => i % 2 === 1)
      .map(p => ({[p]: 'string'}))
      .reduce(mergeParams, {});
  }
  if (ctmpl.hasOwnProperty('AllOf')) {
    return ctmpl.AllOf.map(extractParams).reduce(mergeParams, {});
  }
  if (ctmpl.hasOwnProperty('AnyOf')) {
    return ctmpl.AnyOf.map(extractParams).reduce(mergeParams, {});
  }
  if (ctmpl.hasOwnProperty('for')) {
    return _.omit(mergeParams({
      [ctmpl.in]: 'array',
      [ctmpl.for]: 'string', // require that result from 'each' can be merged with 'for' being a string
    }, extractParams(ctmpl.each)), ctmpl.for); // omit 'for' as it's declared here
  }
  if (ctmpl.hasOwnProperty('if')) {
    return mergeParams({
      [ctmpl.if]: 'boolean',
    }, mergeParams(
      extractParams(ctmpl.then),
      ctmpl.hasOwnProperty('else') ? extractParams(ctmpl.else) : {},
    ));
  }
  throw new Error('extractParams expects a compiled scope expression templates');
};

/** Render a scope expression from a compiled scope expression template and parameters */
const render = (compiledTemplate, params) => {
  const ctmpl = compiledTemplate;
  if (ctmpl instanceof Array) {
    return ctmpl.map((value, i) => {
      if (i % 2 === 1) {
        if (typeof params[value] !== 'string' && typeof params[value] !== 'number') {
          throw new Error(`Scope expression template expected parameter '${value}' to be a string or number`);
        }
        return params[value];
      }
      return value;
    }).join('');
  }
  if (ctmpl.hasOwnProperty('AllOf')) {
    const AllOf = [];
    ctmpl.AllOf.forEach(t => {
      const result = render(t, params);
      if (result !== null) {
        if (result instanceof Array) {
          AllOf.push(...result);
        } else {
          AllOf.push(result);
        }
      }
    });
    return {AllOf};
  }
  if (ctmpl.hasOwnProperty('AnyOf')) {
    const AnyOf = [];
    ctmpl.AnyOf.forEach(t => {
      const result = render(t, params);
      if (result !== null) {
        if (result instanceof Array) {
          AnyOf.push(...result);
        } else {
          AnyOf.push(result);
        }
      }
    });
    return {AnyOf};
  }
  if (ctmpl.hasOwnProperty('for')) {
    const value = params[ctmpl.in];
    if (value instanceof Array) {
      const nestedParams = _.assign({}, params);
      return value.map(val => {
        nestedParams[ctmpl.for] = val;
        return render(ctmpl.each, nestedParams);
      }).filter(v => v !== null);
    }
    throw new Error(`Scope expression template expected parameter '${ctmpl.in}' to be a array`);
  }
  if (ctmpl.hasOwnProperty('if')) {
    const value = params[ctmpl.if];
    if (value === true) {
      return render(ctmpl.then, params);
    }
    if (value === false) {
      if (ctmpl.hasOwnProperty('else')) {
        return render(ctmpl.else, params);
      }
      return null;
    }
    throw new Error(`Scope expression template expected parameter '${ctmpl.if}' to be a boolean`);
  }
};

/** Scope expression templates handles extraction of parameters and rendering of intermediate state */
module.exports = class ScopeExpressionTemplate {
  constructor(template) {
    this.template = template;
    this._compiledTemplate = compileTemplate(template);
    this._paramTypes = Object.entries(extractParams(this._compiledTemplate));
    this.params = this._paramTypes.map(([p, T]) => p);
  }

  /** Render this scope expression template into a scope expression given params */
  render(params) {
    try {
      return render(this._compiledTemplate, params);
    } catch (err) {
      err.params = params;
      err.template = this.template;
      throw err;
    }
  }

  /** Validate if params are sufficient to render this template */
  validate(params) {
    return this._paramTypes.every(([p, T]) => {
      const val = params[p];
      if (T === 'string') {
        return typeof val === 'string' || typeof val === 'number';
      }
      if (T === 'array') {
        return val instanceof Array && val.every(v => typeof v === 'string');
      }
      if (T === 'boolean') {
        return typeof val === 'boolean';
      }
      throw new Error('internal error in _paramTypes extracted from compiled template');
    });
  }

  static validate(template) {
    return validRootTemplate(template);
  }
};
