const assert = require('assert');
const yaml = require('js-yaml');

/*
 * Create a YAML type that loads from environment variable
 */
const createType = (env, vars, name, typeName, deserialize) => {
  return new yaml.Type(name, {
    kind: 'scalar', // Takes a string as input
    resolve: (data) => {
      return typeof data === 'string' && /^[A-Z0-9_]+$/.test(data);
    },
    // Deserialize the data, in the case we read the environment variable
    construct: (data) => {
      if (Array.isArray(vars)) {
        vars.push({
          type: name,
          var: data,
        });
        return undefined;
      }
      let value = env[data];
      if (value === undefined) {
        return value;
      }
      assert(typeof value === 'string', `${name} key env vars must be strings: ${data} is ${typeof value}`);
      return deserialize(value);
    },
  });
};

/*
 * This schema allows our special !env types
 */
module.exports = (env, vars) => yaml.Schema.create(yaml.JSON_SCHEMA, [
  createType(env, vars, '!env', 'string', val => {
    return val;
  }),
  createType(env, vars, '!env:string', 'string', val => {
    return val;
  }),
  createType(env, vars, '!env:number', 'number', val => {
    return parseFloat(val);
  }),
  createType(env, vars, '!env:bool', 'boolean', val => {
    if (/^true$/i.test(val)) {
      return true;
    }
    if (/^false$/i.test(val)) {
      return false;
    }
    return undefined;
  }),
  createType(env, vars, '!env:json', 'json', val => {
    return JSON.parse(val);
  }),
  createType(env, vars, '!env:list', 'list', val => {
    return (val.match(/'[^']*'|"[^"]*"|[^ \t]+/g) || []).map(entry =>{
      let n = entry.length;
      if (entry[0] === '\'' && entry[n - 1] === '\'' ||
          entry[0] === '"' && entry[n - 1] === '"') {
        return entry.substring(1, n - 1);
      }
      return entry;
    });
  }),
]);
