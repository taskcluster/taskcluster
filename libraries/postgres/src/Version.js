const path = require('path');
const assert = require('assert').strict;
const yaml = require('js-yaml');
const fs = require('fs');

class Version {
  static fromYamlFile(filename) {
    const content = yaml.safeLoad(fs.readFileSync(filename));
    Version._checkContent(content, filename);

    return new Version(content.version, content.migrationScript, content.methods);
  }

  static fromSerializable(serializable) {
    for (let k of Object.keys(serializable)) {
      if (!['methods', 'migrationScript', 'version'].includes(k)) {
        throw new Error(`unexpected version key ${k}`);
      }
    }
    return new Version(serializable.version, serializable.migrationScript, serializable.methods);
  }

  asSerializable() {
    return {
      version: this.version,
      migrationScript: this.migrationScript,
      methods: this.methods,
    };
  }

  constructor(version, migrationScript, methods) {
    this.version = version;
    this.migrationScript = migrationScript;
    this.methods = methods;
  }

  static _checkContent(content, filename) {
    assert(content.version, `version field missing in ${filename}`);
    assert(content.migrationScript, `migrationScript field missing in ${filename}`);
    assert(content.methods, `methods field missing in ${filename}`);

    assert(Object.keys(content).length, 3, `unknown fields in ${filename}`);

    const fileBase = path.basename(filename, '.yml');
    assert.equal(content.version, Number(fileBase), `filename ${filename} must match version`);

    Object.keys(content.methods).forEach(name => {
      assert(!/.*[A-Z].*/.test(name), `db function method ${name} in ${filename} has capital letters`);
      const method = content.methods[name];

      assert.deepEqual(Object.keys(method).sort(), [
        'args',
        'body',
        'description',
        'mode',
        'returns',
        'serviceName',
      ], `unexpected or missing properties in method ${name} in ${filename}`);
    });
  }

}

module.exports = Version;
