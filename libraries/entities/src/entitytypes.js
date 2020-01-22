const _ = require('lodash');
const slugid = require('slugid');
const stringify = require('json-stable-stringify');
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

const checkSize = function(property, value, maxSize) {
  if (value.length <= maxSize) {
    return;
  }

  const err = new Error('Property ' + property + ' is larger than ' + maxSize +
    ' bytes when encoded for storage');
  err.code = 'PropertyTooLarge';

  throw err;
};

class BaseType {
  constructor(property) {
    this.property = property;
  }

  isOrdered = false;
  isComparable = false;
  isEncrypted = false;

  serialize(target, value, cryptoKey) {
    throw new Error('Not implemented');
  }

  equal(value1, value2) {
    const target1 = {};
    const target2 = {};

    this.serialize(target1, value1);
    this.serialize(target2, value2);

    return _.isEqual(target1, target2);
  }

  string(value) {
    throw new Error('Operation is not supported for this data type');
  }

  hash(value) {
    return this.string(value);
  }
}

class BaseValueType extends BaseType {
  isOrdered = true;
  isComparable = true;

  deserialize(source) {
    const value = source[this.property];
    this.validate(value);
    return value;
  }

  validate(value) {
    throw new Error('Not implemented');
  }

  serialize(target, value, cryptoKey) {
    this.validate(value);
    target[this.property] = value;
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

class BooleanType extends BaseValueType {
  validate(value) {
    checkType('BooleanType', this.property, value, 'boolean');
  }

  string(value) {
    this.validate(value);
    return value.toString();
  }
}

class SlugIdType extends BaseValueType {
  isOrdered = true;
  isComparable = true;

  validate(value) {
    checkType('SlugIdType', this.property, value, 'string');
    if (!SLUG_ID_RE.test(value)) {
      throw new Error(`SlugIdType ${this.property} expected a slugid got: ${value}`);
    }
  }

  serialize(target, value) {
    this.validate(value);
    target[this.property] = slugid.decode(value);
  }

  deserialize(source) {
    return slugid.encode(source[this.property]);
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

class BaseBufferType extends BaseType {
  isOrdered = false;
  isComparable = false;

  toBuffer(value, cryptoKey) {
    throw new Error('Not implemented');
  }

  fromBuffer(buffer, cryptoKey) {
    throw new Error('Not implemented');
  }

  serialize(target, value, cryptoKey) {
    value = this.toBuffer(value, cryptoKey);
    checkSize(this.property, value, 256 * 1024);
    // We have one chunk per 64kb
    const chunks = Math.ceil(value.length / (64 * 1024));
    for (let i = 0; i < chunks; i++) {
      const end   = Math.min((i + 1) * 64 * 1024, value.length);
      const chunk = value.slice(i * 64 * 1024, end);
      target['__buf' + i + '_' + this.property] = chunk.toString('base64');
    }
    target['__bufchunks_' + this.property] = chunks;
  }

  hash(value) {
    return this.toBuffer(value);
  }

  deserialize(source, cryptoKey) {
    const n = source['__bufchunks_' + this.property];
    checkType('BaseBufferType', '__bufchunks_' + this.property, n, 'number');

    const chunks = [];
    for (let i = 0; i < n; i++) {
      chunks[i] = Buffer.from(source['__buf' + i + '_' + this.property], 'base64');
    }
    return this.fromBuffer(Buffer.concat(chunks), cryptoKey);
  }
}

class DateType extends BaseType {
  isOrdered = true;
  isComparable = true;

  validate(value) {
    if (!(value instanceof Date)) {
      throw new Error(`DateType ${this.property} expected a date got type ${typeof value}`);
    }
  }

  serialize(target, value) {
    this.validate(value);

    target[this.property] = value.toJSON();
  }

  equal(value1, value2) {
    this.validate(value1);
    this.validate(value2);

    return value1.getTime() === value2.getTime();
  }

  string(value) {
    this.validate(value);

    return value.toJSON();
  }

  deserialize(source) {
    const value = new Date(source[this.property]);
    this.validate(value);

    return value;
  }
}

class JSONType extends BaseBufferType {
  validate(value) {
    checkType('JSONType', this.property, value, [
      'string',
      'number',
      'object',
      'boolean',
    ]);
  }

  toBuffer(value) {
    this.validate(value);
    return Buffer.from(JSON.stringify(value), 'utf8');
  }

  fromBuffer(value) {
    return JSON.parse(value.toString('utf8'));
  }

  equal(value1, value2) {
    return _.isEqual(value1, value2);
  }

  hash(value) {
    return stringify(value);
  }

  clone(value) {
    return _.cloneDeep(value);
  }
}

class TextType extends BaseBufferType {
  validate(value) {
    checkType('TextType', this.property, value, 'string');
  }

  toBuffer(value) {
    this.validate(value);
    return Buffer.from(value, 'utf8');
  }

  fromBuffer(value) {
    return value.toString('utf8');
  }

  equal(value1, value2) {
    return value1 === value2;
  }

  hash(value) {
    return value;
  }

  clone(value) {
    return value;
  }
}

module.exports = {
  Boolean: function(property) {
    return new BooleanType(property);
  },
  Number: function(property) {
    return new NumberType(property);
  },
  PositiveInteger: function(property) {
    return new PositiveIntegerType(property);
  },
  Date: function(property) {
    return new DateType(property);
  },
  UUID: 'uuid',
  SlugId: function(property) {
    return new SlugIdType(property);
  },
  BaseBufferType: 'base-buffer-type',
  Blob: 'blob',
  JSON: function (property) {
    return new JSONType(property);
  },
  Schema: 'schema',
  EncryptedBlob: 'encrypted-blob',
  EncryptedText: 'encrypted-text',
  EncryptedJSON: 'encrypted-json',
  EncryptedSchema: 'encrypted-schema',
  SlugIdArray: 'slug-id-array',
  String: function(property) {
    return new StringType(property);
  },
  Text: function (property) {
    return new TextType(property);
  },
};
