const assert = require('assert').strict;

class Method {
  /**
   * Load a Method from the content inside the version in a db/versions/nnn.yml
   * file
   */
  static fromYamlFileContent(name, content, filename) {
    assert(!/.*[A-Z].*/.test(name), `db function method ${name} in ${filename} has capital letters`);
    const method = new Method(name, content);
    method._check(name, content, filename);
    return method;
  }

  /**
   * Load a Method from a serialized representation
   */
  static fromSerializable(name, serializable) {
    const method = new Method(name, serializable);
    method._check(name, serializable, 'serializable input');
    return method;
  }

  /**
   * Create a serialized representation
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

  constructor(name, {description, mode, serviceName, args, returns, body, deprecated}) {
    this.name = name;
    this.description = description;
    this.mode = mode;
    this.serviceName = serviceName;
    this.args = args;
    this.returns = returns;
    this.body = body;
    this.deprecated = Boolean(deprecated);
  }

  _check(name, content, filename) {
    assert(this.description, `method ${name} in ${filename} is missing description`);
    assert(['read', 'write'].includes(this.mode), `method ${name} in ${filename} has missing or bad mode`);
    assert(this.serviceName, `method ${name} in ${filename} is missing serviceName`);
    assert(this.args !== undefined, `method ${name} in ${filename} is missing args (use an empty string?)`);
    assert(this.returns, `method ${name} in ${filename} is missing returns (use void?)`);
    assert(this.body, `method ${name} in ${filename} is missing body`);
    for (let k of Object.keys(content)) {
      if (!['description', 'mode', 'serviceName', 'args', 'returns', 'body', 'deprecated'].includes(k)) {
        throw new Error(`unexpected properties for method ${name} in ${filename}`);
      }
    }
  }

  checkUpdateFrom(name, existing, version) {
    assert.equal(existing.mode, this.mode, `method ${name} changed mode in version ${version.version}`);
    assert.equal(existing.serviceName, this.serviceName, `method ${name} changed serviceName in version ${version.version}`);
    assert.equal(existing.args, this.args, `method ${name} changed args in version ${version.version}`);
    assert.equal(existing.returns, this.returns, `method ${name} changed returns in version ${version.version}`);
  }
}

module.exports = Method;
