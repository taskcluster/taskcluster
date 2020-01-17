class StringKey {
  constructor(mapping, key) {
    assert(mapping[this.key], `key ${key} is not defined in mapping`);

    this.key = key;
    this.mapping = mapping;
    this.covers = [key];
  }
}

class DescendingIntegerKey {
  constructor(mapping, key) {
    assert(mapping[this.key], `key ${key} is not defined in mapping`);

    this.key = key;
    this.type = mapping[key];
    this.covers = [key];
  }
}

class AscendingIntegerKey {
  constructor(mapping, key) {
    assert(mapping[this.key], `key ${key} is not defined in mapping`);

    this.key = key;
    this.type = mapping[key];
    this.covers = [key];
  }
}

class ConstantKey {
  constructor(constant) {
    assert.equal(typeof constant, 'string', 'ConstantKey takes a string');

    this.constant = constant;
    this.covers = [];
  }
}

class CompositeKey {
  constructor(mapping, keys) {
    assert(keys instanceof Array, 'keys must be an array');
    assert(keys.length > 0, 'CompositeKey needs at least one key');

    this.keys = keys;
    this.types = [];

    for (let i = 0; i < keys.length; i++) {
      assert(mapping[keys[i]], `key ${keys[i]} is not defined in mapping`);
      this.types[i] = mapping[keys[i]];
    }

    this.covers = keys;
  }
}

class HashKey {
  constructor(mapping, keys) {
    assert(keys instanceof Array, 'keys must be an array');
    assert(keys.length > 0, 'HashKey needs at least one key');

    this.keys = keys;
    this.mapping = mapping;
    this.covers = keys;
    this.types = [];

    for (let i = 0; i < keys.length; i++) {
      assert(mapping[keys[i]], `key ${keys[i]} is not defined in mapping`);
      this.types[i] = mapping[keys[i]];
    }
  }
}

module.exports = {
  StringKey: key => {
    const keys = [...arguments];

    assert.equal(keys.length, 1, 'StringKey takes exactly one key argument');
    assert.equal(typeof key, 'string', 'StringKey takes a string as argument');

    return mapping => new StringKey(mapping, key);
  },
  DescendingIntegerKey: key => mapping => new DescendingIntegerKey(mapping, key),
  AscendingIntegerKey: key => mapping => new AscendingIntegerKey(mapping, key),
  ConstantKey: constant => {
    assert.equal(typeof constant, 'string', `ConstantKey takes a string`);
    return mapping => new ConstantKey(key);
  },
  CompositeKey: () => {
    const keys = [...arguments];

    keys.forEach(function(key) {
      assert.equal(typeof key, 'string', 'CompositeKey takes strings as arguments');
    });

    return mapping => new CompositeKey(mapping, keys)
  },
  HashKey: () => {
    const keys = [...arguments];

    keys.forEach(function(key) {
      assert.equal(typeof key, 'string', 'HashKey takes strings as arguments');
    });

    return mapping => new HashKey(mapping, keys);
  },
};
