'use strict';
const {WMObject} = require('../lib/object');
const errors = require('./errors');

class BaseDatastore extends WMObject {
  constructor({id}) {
    super({id});
  }

  async connect() {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.connect()');
  }

  async disconnect() {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.disconnect()');
  }

  async get(namespace, key) {
    if (typeof namespace !== 'string') {
      this._throw(errors.InvalidDatastoreNamespace);
    }
    if (typeof key !== 'string') {
      this._throw(errors.InvalidDatastoreKey);
    }
    return this._get(namespace, key);
  }

  async has(namespace, key) {
    if (typeof namespace !== 'string') {
      this._throw(errors.InvalidDatastoreNamespace);
    }
    if (typeof key !== 'string') {
      this._throw(errors.InvalidDatastoreKey);
    }
    return this._has(namespace, key);
  }

  async set(namespace, key, value) {
    if (typeof namespace !== 'string') {
      this._throw(errors.InvalidDatastoreNamespace);
    }
    if (typeof key !== 'string') {
      this._throw(errors.InvalidDatastoreKey);
    }
    return this._set(namespace, key, value);
  }

  async delete(namespace, key) {
    if (typeof namespace !== 'string') {
      this._throw(errors.InvalidDatastoreNamespace);
    }
    if (typeof key !== 'string') {
      this._throw(errors.InvalidDatastoreKey);
    }
    return this._delete(namespace, key);
  }

  async _get(namespace, key) {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.get()');
  }

  async _has(namespace, key) {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.has()');
  }

  async _set(namespace, key, value) {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.set()');
  }

  async _delete(namespace, key) {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.set()');
  }
}

class InMemoryDatastore extends BaseDatastore {
  constructor({id}) {
    super({id});
    this.namespaces = new Map();
  }

  async connect() {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.connect()');
  }

  async disconnect() {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.disconnect()');
  }

  _getNamespace(namespace) {
    if (!this.namespaces.has(namespace)) {
      this.namespaces.set(namespace, new Map());
    }
    return this.namespaces.get(namespace);
  }

  async _get(namespace, key) {
    return this._getNamespace(namespace).get(key);
  }

  async _has(namespace, key) {
    return this._getNamespace(namespace).has(key);
  }

  async _set(namespace, key, value) {
    return this._getNamespace(namespace).set(key, value);
  }

  async _delete(namespace, key, value) {
    let ns = this._getNamespace(namespace)
    ns.delete(key, value);
    if (ns.size === 0) {
      this.namespaces.delete(namespace);
    }
  }
}

module.exports = {
  BaseDatastore,
  InMemoryDatastore,
};


