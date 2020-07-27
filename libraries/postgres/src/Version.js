const path = require('path');
const assert = require('assert').strict;
const Method = require('./Method');
const { loadSql } = require('./util');

const objMap = (obj, fn) => Object.fromEntries(Object.entries(obj).map(fn));
const ALLOWED_KEYS = ['version', 'migrationScript', 'downgradeScript', 'methods', 'description'];

class Version {
  /**
   * Load a Version from the content of a db/versions/nnn.yml file
   */
  static fromYamlFileContent(content, filename) {
    Version._checkContent(content, filename);

    return new Version(
      content.version,
      loadSql(content.migrationScript, path.dirname(filename)),
      loadSql(content.downgradeScript, path.dirname(filename)),
      content.description,
      objMap(content.methods,
        ([name, meth]) => [name, Method.fromYamlFileContent(name, meth, filename)]),
    );
  }

  /**
   * Load a Version from a serialized representation
   */
  static fromSerializable(serializable) {
    for (let k of Object.keys(serializable)) {
      if (!ALLOWED_KEYS.includes(k)) {
        throw new Error(`unexpected version key ${k}`);
      }
    }
    return new Version(
      serializable.version,
      serializable.migrationScript,
      serializable.downgradeScript,
      serializable.description,
      objMap(serializable.methods,
        ([name, meth]) => [name, Method.fromSerializable(name, meth)]),
    );
  }

  /**
   * Create a serialized representation
   */
  asSerializable() {
    return {
      version: this.version,
      migrationScript: this.migrationScript,
      downgradeScript: this.downgradeScript,
      description: this.description,
      methods: objMap(this.methods, ([name, meth]) => [name, meth.asSerializable()]),
    };
  }

  constructor(version, migrationScript, downgradeScript, description, methods) {
    this.version = version;
    this.migrationScript = migrationScript;
    this.downgradeScript = downgradeScript;
    this.description = description;
    this.methods = methods;
  }

  static _checkContent(content, filename) {
    assert(content.version, `version field missing in ${filename}`);
    assert(content.methods, `methods field missing in ${filename}`);

    assert(!(Boolean(content.migrationScript) ^ Boolean(content.downgradeScript)),
      `Cannot specify just one of migrationScript and downgradeScript in ${filename}`);

    for (const k of Object.keys(content)) {
      if (!ALLOWED_KEYS.includes(k)) {
        throw new Error(`Unknown version field ${k} in ${filename}`);
      }
    }

    const fileBase = path.basename(filename, '.yml');
    assert.equal(content.version, Number(fileBase), `filename ${filename} must match version`);
  }
}

module.exports = Version;
