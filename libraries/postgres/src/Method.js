const assert = require('assert').strict;

class Method {
  static fromYamlFile(name, content, filename) {
    const method = new Method(content);
    method._check(name, filename);
    return method;
  }

  static fromSerializable(name, serializable) {
    const method = new Method(serializable);
    method._check(name, 'serializable input');
    return method;
  }

  asSerializable() {
    return {
      description: this.description,
      mode: this.mode,
      serviceName: this.serviceName,
      args: this.args,
      returns: this.returns,
      body: this.body,
    };
  }

  constructor({description, mode, serviceName, args, returns, body}) {
    this.description = description;
    this.mode = mode;
    this.serviceName = serviceName;
    this.args = args;
    this.returns = returns;
    this.body = body;
  }

  _check(name, filename) {
    assert(this.description, `method ${name} in ${filename} is missing description`);
    assert(['read', 'write'].includes(this.mode), `method ${name} in ${filename} has missing or bad mode`);
    assert(this.serviceName, `method ${name} in ${filename} is missing serviceName`);
    assert(this.args !== undefined, `method ${name} in ${filename} is missing args (use an empty string?)`);
    assert(this.returns, `method ${name} in ${filename} is missing returns (use void?)`);
    assert(this.body, `method ${name} in ${filename} is missing body`);
  }
}

module.exports = Method;
