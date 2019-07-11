/**
 * Convery lib-config !env types into json-schema
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
        type: 'object',
        additionalProperties: true,
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
