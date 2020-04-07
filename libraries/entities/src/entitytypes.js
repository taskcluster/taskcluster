const assert = require('assert').strict;
const _ = require('lodash');
const slugid = require('slugid');
const stringify = require('json-stable-stringify');
const crypto = require('crypto');
const Ajv = require('ajv');
const { SLUG_ID_RE, SLUGID_SIZE } = require('./constants');
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

// Convert slugid to buffer
const slugIdToBuffer = function(slug) {
  const base64 = slug
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    + '==';

  return Buffer.from(base64, 'base64');
};

// Convert buffer to slugId where `entryIndex` is the slugId entry index to retrieve
const bufferToSlugId = function(bufferView, entryIndex) {
  return bufferView.toString('base64', entryIndex * SLUGID_SIZE, SLUGID_SIZE * (entryIndex + 1))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/==/g, '');
};

class BaseType {
  constructor(property) {
    this.property = property;
    this.isEncrypted = false;
  }

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

  string(value) {
    this.validate(value);
    return value.toString();
  }
}

class PositiveIntegerType extends NumberType {
  validate(value) {
    checkType('PositiveIntegerType', this.property, value, 'number');
    if (!isNaN(value) && value % 1 !== 0) {
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
  toBuffer(value, cryptoKey) {
    throw new Error('Not implemented');
  }

  fromBuffer(buffer, cryptoKey) {
    throw new Error('Not implemented');
  }

  serialize(target, value, cryptoKey) {
    value = this.toBuffer(value, cryptoKey);
    //checkSize(this.property, value, 256 * 1024);
    // We have one chunk per 64kb
    const chunks = Math.ceil(value.length / (64 * 1024));
    for (let i = 0; i < chunks; i++) {
      const end = Math.min((i + 1) * 64 * 1024, value.length);
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

class SlugIdArray {
  constructor() {
    this.buffer = Buffer.alloc(SLUGID_SIZE * 32);
    this.length = 0;
    this.avail = 32;
  }

  toArray() {
    const buffer = this.getBufferView();
    let result = [];

    for (let i = 0; i < this.length; i++) {
      const slug = bufferToSlugId(buffer, i);

      result.push(slug);
    }

    return result;
  }

  push(slug) {
    this.realloc();
    slugIdToBuffer(slug).copy(this.buffer, this.length * SLUGID_SIZE);
    this.length += 1;
    this.avail -= 1;
  }

  realloc() {
    if (this.avail === 0 && this.length === 0) {
      this.buffer = Buffer.alloc(SLUGID_SIZE * 32);
      this.length = 0;
      this.avail = 32;

      return true;
    }

    // Allocate more space, if needed, we this by doubling the underlying buffer
    if (this.avail === 0) {
      const buffer = Buffer.alloc(this.length * 2 * SLUGID_SIZE);
      this.buffer.copy(buffer);
      this.buffer = buffer;
      this.avail = this.length;
      return true;
    }

    // Shrink the buffer if it is less than 1/3 full
    if (this.avail > this.length * 2 && this.buffer.length > SLUGID_SIZE * 32) {
      this.buffer = Buffer.from(this.getBufferView());
      this.avail = 0;
      return true;
    }
    return false;
  }

  indexOf(slug) {
    const slugBuffer = slugIdToBuffer(slug);
    let index = this.buffer.indexOf(slugBuffer);

    while (index !== -1 && index < this.length * SLUGID_SIZE) {
      if (index % SLUGID_SIZE === 0) {
        return index / SLUGID_SIZE;
      }
      index = this.buffer.indexOf(slugBuffer, index + 1);
    }
    return -1;
  }

  includes(slug) {
    return this.indexOf(slug) !== -1 ? true : false;
  }

  shift() {
    if (this.length === 0) {
      return;
    }

    const result = bufferToSlugId(this.buffer, 0);

    this.buffer.copy(this.buffer, 0, SLUGID_SIZE);

    this.avail += 1;
    this.length -= 1;
    this.realloc();

    return result;
  }

  pop() {
    if (this.length === 0) {
      return;
    }

    const result = bufferToSlugId(this.buffer, this.length - 1);

    this.avail += 1;
    this.length -= 1;
    this.realloc();

    return result;
  }

  remove(slug) {
    const index = this.indexOf(slug);

    if (index > -1) {
      // This uses memmove, so my cowboy tricks are okay, - I hope :)
      this.buffer.copy(
        this.buffer,
        index * SLUGID_SIZE,
        (index + 1) * SLUGID_SIZE,
      );
      this.avail += 1;
      this.length -= 1;
      this.realloc();
      return true;
    }
    return false;
  }

  slice(begin, end) {
    if (begin < 0) {
      begin = this.length + begin;
    } else {
      begin = begin || 0;
    }

    if (end < 0) {
      end = this.length + end;
    } else {
      end = !end || this.length > end ? this.length : end;
    }

    // Return a copy of the array
    const count = end - begin;
    const buffer = this.buffer.slice(begin * SLUGID_SIZE, end * SLUGID_SIZE);
    let result = [];

    for (let i = 0; i < count; i++) {
      result.push(bufferToSlugId(buffer, i));
    }

    return result;
  }

  clone() {
    const clone = new SlugIdArray();
    clone.buffer = Buffer.from(this.buffer);
    clone.length = this.length;
    clone.avail = this.avail;

    return clone;
  }

  equals(other) {
    assert(other instanceof SlugIdArray, 'Expected a SlugIdArray');

    return Buffer.compare(
      this.getBufferView(),
      other.getBufferView(),
    ) === 0;
  }

  getBufferView() {
    return this.buffer.slice(0, this.length * SLUGID_SIZE);
  }

  static fromBuffer(buffer) {
    const array = new SlugIdArray();

    array.buffer = buffer;
    array.length = buffer.length / SLUGID_SIZE;
    array.avail = 0;

    return array;
  }
}

class SlugIdArrayType extends BaseBufferType {
  toBuffer(value, cryptoKey) {
    assert(value instanceof SlugIdArray, `SlugIdArrayType ${this.property} expected SlugIdArray, got ${value}`);

    return value.getBufferView();
  }

  fromBuffer(value) {

    return SlugIdArray.fromBuffer(value);
  }

  equal(value1, value2) {
    assert(value1 instanceof SlugIdArray, `SlugIdArrayType ${this.property} expected SlugIdArray, got: ${value1}`);
    assert(value2 instanceof SlugIdArray, `SlugIdArrayType ${this.property} expected SlugIdArray, got: ${value2}`);

    return value1.equals(value2);
  }

  hash(value) {
    assert(value instanceof SlugIdArray, `SlugIdArrayType ${this.property} expected SlugIdArray, got: ' ${value}`);

    return value.getBufferView();
  }

  clone(value) {
    assert(value instanceof SlugIdArray, `SlugIdArrayType ${this.property} expected SlugIdArray, got: ${value}`);

    return value.clone();
  }
}

class EncryptedBaseType extends BaseBufferType {
  constructor(property) {
    super(property);
    this.isEncrypted = true;
  }

  toPlainBuffer(value) {
    throw new Error('Not implemented');
  }

  fromPlainBuffer(buffer) {
    throw new Error('Not implemented');
  }

  toBuffer(value, cryptoKey) {
    const plainBuffer = this.toPlainBuffer(value);
    // Need room for initialization vector and any padding
    checkSize(this.property, plainBuffer, 256 * 1024 - 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', cryptoKey, iv);
    const c1 = cipher.update(plainBuffer);
    const c2 = cipher.final();

    return Buffer.concat([iv, c1, c2]);
  }

  fromBuffer(buffer, cryptoKey) {
    const iv = buffer.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', cryptoKey, iv);
    const b1 = decipher.update(buffer.slice(16));
    const b2 = decipher.final();

    return this.fromPlainBuffer(Buffer.concat([b1, b2]));
  }

  hash(value) {
    return this.toPlainBuffer(value);
  }
}

class EncryptedTextType extends EncryptedBaseType {
  validate (value) {
    checkType('EncryptedTextType', this.property, value, 'string');
  }

  toPlainBuffer (value) {
    this.validate(value);
    return Buffer.from(value, 'utf8');
  }

  fromPlainBuffer (value) {
    return value.toString('utf8');
  }

  equal (value1, value2) {
    return value1 === value2;
  }

  hash (value) {
    return value;
  }

  clone (value) {
    return value;
  }
}

class EncryptedJSONType extends EncryptedBaseType {
  validate(value) {
    checkType('EncryptedJSONType', this.property, value, [
      'string',
      'number',
      'object',
      'boolean',
    ]);
  }

  toPlainBuffer(value) {
    this.validate(value);
    return Buffer.from(JSON.stringify(value), 'utf8');
  }

  fromPlainBuffer(value) {
    return JSON.parse(value.toString('utf8'));
  }

  equal(value1, value2) {
    return _.isEqual(value1, value2);
  }

  hash (value) {
    return stringify(value);
  }

  clone (value) {
    return _.cloneDeep(value);
  }
}

class BlobType extends BaseBufferType {
  validate(value) {
    assert(Buffer.isBuffer(value),
      'BlobType \'' + this.property + '\' expected a Buffer');
  }

  toBuffer(value) {
    this.validate(value);
    return value;
  }

  fromBuffer(value) {
    this.validate(value);
    return value;
  }

  equal(value1, value2) {
    this.validate(value1);
    this.validate(value2);
    if (value1 === value2) {
      return true;
    }
    if (value1.length !== value2.length) {
      return false;
    }
    return Buffer.compare(value1, value2) === 0;
  }

  clone(value) {
    this.validate(value);
    return Buffer.from(value);
  }
}

class EncryptedBlob extends EncryptedBaseType {
  validate(value) {
    assert(Buffer.isBuffer(value),
      'EncryptedBlobType \'' + this.property + '\' expected a Buffer');
  }

  toPlainBuffer(value) {
    this.validate(value);
    return value;
  }

  fromPlainBuffer(value) {
    this.validate(value);
    return value;
  }

  equal(value1, value2) {
    this.validate(value1);
    this.validate(value2);
    if (value1 === value2) {
      return true;
    }
    if (value1.length !== value2.length) {
      return false;
    }
    return Buffer.compare(value1, value2) === 0;
  }

  clone(value) {
    this.validate(value);
    return Buffer.from(value);
  }
}

const _uuidExpr = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
class UUIDType extends BaseValueType {
  validate(value) {
    checkType('UUIDType', this.property, value, 'string');
    if (!_uuidExpr.test(value)) {
      throw new Error('UUIDType \'' + this.property + '\' expected a uuid got: '
        + value);
    }
  }

  equal(value1, value2) {
    return value1.toLowerCase() === value2.toLowerCase();
  }

  string(value) {
    return value.toLowerCase();
  }

  serialize(target, value) {
    this.validate(value);
    target[this.property + '@odata.type'] = 'Edm.Guid';
    target[this.property] = value;
  }

  compare(entity, op) {
    throw new Error('Not implemented');
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
  UUID: function(property) {
    return new UUIDType(property);
  },
  SlugId: function(property) {
    return new SlugIdType(property);
  },
  BaseBufferType: function(property) {
    return new BaseBufferType(property);
  },
  Blob: function(property) {
    return new BlobType(property);
  },
  JSON: function (property) {
    return new JSONType(property);
  },
  Schema: function(schema) {
    let ajv = new Ajv({useDefaults: true});
    let validate = ajv.compile(schema);

    /** Schema Entity type */
    class SchemaEnforcedType extends JSONType {
      validate(value) {
        if (validate(value)) {
          return;
        }
        let err = new Error(
          'SchemaEnforcedType \'' + this.property +
          '\' schema validation failed: ' + ajv.errorsText(validate.errors),
        );
        err.errors = validate.errors;
        err.value = value;
        throw err;
      }
    }

    return SchemaEnforcedType;
  },
  EncryptedBlob: function(property) {
    return new EncryptedBlob(property);
  },
  EncryptedText: function (property) {
    return new EncryptedTextType(property);
  },
  EncryptedJSON: function(props) {
    return new EncryptedJSONType(props);
  },
  EncryptedSchema: function(schema) {
    let ajv = new Ajv({useDefaults: true});
    let validate = ajv.compile(schema);

    /** Schema Entity type */
    class EncryptedSchemaEnforcedType extends EncryptedJSONType {
      validate(value) {
        if (validate(value)) {
          return;
        }
        let err = new Error(
          'EncryptedSchemaEnforcedType \'' + this.property +
          '\' schema validation failed: ' + ajv.errorsText(validate.errors),
        );
        err.errors = validate.errors;
        err.value = value;
        throw err;
      }
    }

    return EncryptedSchemaEnforcedType;
  },
  SlugIdArray: class {
    constructor(property) {
      return new SlugIdArrayType(property);
    }

    static create() {
      return new SlugIdArray();
    }
  },
  String: function(property) {
    return new StringType(property);
  },
  Text: function (property) {
    return new TextType(property);
  },
};
