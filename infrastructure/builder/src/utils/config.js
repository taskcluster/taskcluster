/**
 * Convert lib-config !env types into json-schema
 */
exports.configToSchema = type => {
  switch (type) {
    case '!env': {
      return {
        type: 'string',
      };
    }
    case '!env:string': {
      return {
        type: 'string',
      };
    }
    case '!env:number': {
      return {
        type: 'number',
      };
    }
    case '!env:bool': {
      return {
        type: 'boolean',
      };
    }
    case '!env:json': {
      return {
        oneOf: [
          {
            type: 'object',
            additionalProperties: true,
          },
          {
            type: 'array',
          },
        ],
      };
    }
    case '!env:list': {
      return {
        type: 'array',
      };
    }
    default: throw new Error(`Unknown config type ${type}`);
  }
};

/**
 * Convert lib-config !env types into example values
 */
exports.configToExample = (type, optional) => {
  let expl = optional ? '(optional) ' : '';
  switch (type) {
    case '!env': return `${expl}...`;
    case '!env:string': return `${expl}...`;
    case '!env:number': return `${expl}...`;
    case '!env:bool': return `${expl}true/false`;
    case '!env:json': return `${expl}{}`;
    case '!env:list': return `${expl}[]`;
    default: throw new Error(`Unknown config type ${type}`);
  }
};
