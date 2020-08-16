const { isPlainObject } = require('lodash');
const assert = require('assert').strict;

class Access {
  /**
   * Load an Access from the the content of a db/access.yml file.
   */
  static fromYamlFileContent(content, filename) {
    // The serializable format is the same as the access.yml file,
    // so just short-circuit to that function, while keeping this
    // function to parallel similar methods in Schema, Version, etc.
    return Access.fromSerializable(content);
  }

  /**
   * Load an Access from a serialized representation
   */
  static fromSerializable(serializable) {
    const access = new Access(serializable);
    access._check(serializable, 'serializable input');
    return access;
  }

  /**
   * Create a serialized representation
   */
  asSerializable() {
    return this.services;
  }

  constructor(services) {
    this.services = services;
  }

  serviceNames() {
    return Object.keys(this.services);
  }

  tables(serviceName) {
    return this.services[serviceName].tables;
  }

  _check(content, filename) {
    assert(isPlainObject(this.services), `${filename} should define an object`);
    Object.keys(this.services).forEach(serviceName => {
      const serviceAccess = this.services[serviceName];
      assert(isPlainObject(serviceAccess), `each service in ${filename} should define an object`);
      assert.deepEqual(Object.keys(serviceAccess).sort(), ['tables'],
        `each service in ${filename} should only have a 'tables' property`);
      assert(isPlainObject(serviceAccess.tables), `${serviceName}.tables should be an object`);
      Object.entries(serviceAccess.tables).forEach(([table, mode]) => {
        assert(['read', 'write'].includes(mode), `${serviceName}.tables.${table} should be read or write`);
      });
    });
  }
}

module.exports = Access;
