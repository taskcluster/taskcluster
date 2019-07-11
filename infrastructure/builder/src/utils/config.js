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

/**
 * Convert lib-config !env types into example values
 */
exports.configToExample = type => {
  switch (type) {
    case '!env': return '...';
    case '!env:string': return '...';
    case '!env:number': return 1;
    case '!env:bool': return 'true/false';
    case '!env:json': return {};
    case '!env:list': return [];
    default: throw new Error(`Unknown config type ${type}`);
  }
};
