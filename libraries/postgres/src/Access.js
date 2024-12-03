import lodash from 'lodash';
import { strict as assert } from 'assert';

const { isPlainObject } = lodash;

/**
 * @typedef {Object.<string, {tables: Object.<string, ('read'|'write')>}>} AccessDefinition
 */

class Access {
  /**
   * Load an Access from the the content of a db/access.yml file.
   *
   * @param {AccessDefinition} content
   */
  static fromYamlFileContent(content) {
    // The serializable format is the same as the access.yml file,
    // so just short-circuit to that function, while keeping this
    // function to parallel similar methods in Schema, Version, etc.
    return Access.fromSerializable(content);
  }

  /**
   * Load an Access from a serialized representation
   *
   * @param {AccessDefinition} serializable
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

  /**
   * @param {AccessDefinition} services
   */
  constructor(services) {
    this.services = services;
  }

  serviceNames() {
    return Object.keys(this.services);
  }

  /** @param {string} serviceName */
  tables(serviceName) {
    return this.services[serviceName].tables;
  }

  /**
   * @private
   * @param {AccessDefinition} content
   * @param {string} filename
   */
  _check(content, filename) {
    assert(isPlainObject(content), `${filename} should define an object`);
    Object.keys(content).forEach(serviceName => {
      const serviceAccess = content[serviceName];
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

export default Access;
