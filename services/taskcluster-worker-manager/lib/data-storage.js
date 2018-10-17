'use strict';
const {WMObject, errors} = require('../lib/base');

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
    let result = await this._get(namespace, key);
    if (!result) {
      this._throw(errors.InvalidDatastoreKey, `${namespace}::${key} is unknown`);
    }
    return result;
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

  async listNamespaces() {
    return this._listNamespaces(namespace);
  }
  
  async list(namespace) {
    if (typeof namespace !== 'string') {
      this._throw(errors.InvalidDatastoreNamespace);
    }
    return this._list(namespace);
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

  async _listNamespaces() {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.list()');
  }
  
  async _list(namespace) {
    this._throw(errors.MethodUnimplemented, 'BaseDatastore.list()');
  }
}

/**
 * In memory datastore.  Note that it's not thread-safe and really only
 * designed for being a proof-of-concept and for unit tests
 */
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

  async _listNamespaces() {
    return Array.from(this.namespaces.keys());
  }

  async _list(namespace) {
    return Array.from(this._getNamespace(namespace).keys());
  }
}

module.exports = {
  BaseDatastore,
  InMemoryDatastore,
};


