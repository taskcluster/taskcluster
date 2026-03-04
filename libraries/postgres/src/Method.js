import { strict as assert } from 'assert';
import path from 'path';
import { loadSql } from './util.js';

/**
 * @typedef {Object} MethodDefinition
 * @property {string} description
 * @property {string} mode
 * @property {string} serviceName
 * @property {string} args
 * @property {string} returns
 * @property {string} body
 * @property {boolean} deprecated
 */

class Method {
  /**
   * Load a Method from the content inside the version in a db/versions/nnn.yml
   * file
   *
   * @param {string} name
   * @param {MethodDefinition} content
   * @param {string} filename
   * @returns {Method}
   */
  static fromYamlFileContent(name, content, filename) {
    assert(!/.*[A-Z].*/.test(name), `db function method ${name} in ${filename} has capital letters`);
    const method = new Method(name, {
      ...content,
      body: content.body && loadSql(content.body, path.dirname(filename)),
    });
    method._check(name, content, filename);
    return method;
  }

  /**
   * Load a Method from a serialized representation
   *
   * @param {string} name
   * @param {MethodDefinition} serializable
   * @returns {Method}
   */
  static fromSerializable(name, serializable) {
    const method = new Method(name, serializable);
    method._check(name, serializable, 'serializable input');
    return method;
  }

  /**
   * Create a serialized representation
   *
   * @returns {MethodDefinition}
   */
  asSerializable() {
    return {
      description: this.description,
      mode: this.mode,
      serviceName: this.serviceName,
      args: this.args,
      returns: this.returns,
      body: this.body,
      deprecated: this.deprecated,
    };
  }

  /**
   * @param {string} name
   * @param {MethodDefinition} options
   */
  constructor(name, { description, mode, serviceName, args, returns, body, deprecated }) {
    this.name = name;
    this.description = description;
    this.mode = mode;
    this.serviceName = serviceName;
    this.args = args;
    this.returns = returns;
    this.body = body;
    this.deprecated = Boolean(deprecated);
    /** @type {number?} */
    this.version = null; // set by Schema
  }

  /**
   * @param {string} name
   * @param {MethodDefinition} content
   * @param {string} filename
   * @private
   */
  _check(name, content, filename) {
    // these fields are required only if the method is not deprecated
    if (!this.deprecated) {
      assert(this.description, `method ${name} in ${filename} is missing description`);
      assert(['read', 'write'].includes(this.mode), `method ${name} in ${filename} has missing or bad mode`);
      assert(this.serviceName, `method ${name} in ${filename} is missing serviceName`);
      assert(this.args !== undefined, `method ${name} in ${filename} is missing args (use an empty string?)`);
      assert(this.returns, `method ${name} in ${filename} is missing returns (use void?)`);
      assert(this.body, `method ${name} in ${filename} is missing body`);
    }
    for (let k of Object.keys(content)) {
      if (!['description', 'mode', 'serviceName', 'args', 'returns', 'body', 'deprecated'].includes(k)) {
        throw new Error(`unexpected properties for method ${name} in ${filename}`);
      }
    }
  }

  /**
   * @param {string} name
   * @param {Method} existing
   * @param {import('./Version.js').default} version
   */
  checkUpdateFrom(name, existing, version) {
    // these fields may be undefined if the method is deprecated, in which case no change
    // will take place.
    if (this.mode !== undefined) {
      assert.equal(existing.mode, this.mode, `method ${name} changed mode in version ${version.version}`);
    }
    if (this.serviceName !== undefined) {
      assert.equal(existing.serviceName, this.serviceName, `method ${name} changed serviceName in version ${version.version}`);
    }
    if (this.args !== undefined) {
      assert.equal(existing.args, this.args, `method ${name} changed args in version ${version.version}`);
    }
    if (this.returns !== undefined) {
      assert.equal(existing.returns, this.returns, `method ${name} changed returns in version ${version.version}`);
    }
  }
}

export default Method;
