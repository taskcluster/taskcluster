const { SLUG_ID_RE } = require('./constants');
// Check that value is of types for name and property
// Print messages and throw an error if the check fails
function checkType(name, property, value, types) {
  if (!(types instanceof Array)) {
    types = [types];
  }
  if (types.indexOf(typeof value) === -1) {
    throw new Error(`${name} ${property} expected one of type(s): ${types.join(",")} got type: ${typeof value}`);
  }
}

class BaseValueType {
  constructor(property) {
    this.property = property;
  }

  deserialize(source) {
    const value = source[this.property];
    this.validate(value);
    return value;
  }

  validate(value) {
    throw new Error('Not implemented');
  }

  string(value) {
    this.validate(value);
    return value;
  }
}

class StringType extends BaseValueType {
  validate(value) {
    checkType('StringType', this.property, value, 'string');
  }
}

class SlugIdType extends BaseValueType {
  validate(value) {
    checkType('SlugIdType', this.property, value, 'string');
    if (!SLUG_ID_RE.test(value)) {
      throw new Error(`SlugIdType ${this.property} expected a slugid got: ${value}`);
    }
  }
}

class NumberType extends BaseValueType {
  validate(value) {
    checkType('NumberType', this.property, value, 'number');
  }
}

class PositiveIntegerType extends NumberType {
  validate(value) {
    checkType('PositiveIntegerType', this.property, value, 'number');
    if (!isNaN(value) && value % 1  !== 0) {
      throw new Error(`PositiveIntegerType ${this.property} expected an intger got a float or NaN`);
    }

    if (value < 0) {
      throw new Error(`PositiveIntegerType ${this.property} expected a positive integer, got less than zero`);
    }

    if (value > Math.pow(2, 32)) {
      throw new Error(`PositiveIntegerType ${this.property} expected an integer, got more than 2^32`);
    }
  }
}

module.exports = {
  Boolean: 'boolean',
  Number: function(property) {
    return new NumberType(property);
  },
  PositiveInteger: function(property) {
    return new PositiveIntegerType(property);
  },
  Date: 'date',
  UUID: 'uuid',
  SlugId: function(property) {
    return new SlugIdType(property);
  },
  BaseBufferType: 'base-buffer-type',
  Blob: 'blob',
  JSON: 'json',
  Schema: 'schema',
  EncryptedBlob: 'encrypted-blob',
  EncryptedText: 'encrypted-text',
  EncryptedJSON: 'encrypted-json',
  EncryptedSchema: 'encrypted-schema',
  SlugIdArray: 'slug-id-array',
  String: function(property) {
    return new StringType(property);
  },
  Text: 'text',
};
