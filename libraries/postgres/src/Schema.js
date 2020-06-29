const fs = require('fs');
const assert = require('assert').strict;
const yaml = require('js-yaml');
const path = require('path');
const Version = require('./Version');
const Access = require('./Access');
const Relations = require('./Relations');

class Schema {
  constructor(versions, access, tables) {
    this.versions = versions;
    this.access = access;
    this.tables = tables;
  }

  /**
   * Load a Schema from a db directory
   */
  static fromDbDirectory(directory) {
    const dentries = fs.readdirSync(path.join(directory, 'versions'));
    let versions = [];

    dentries.forEach(dentry => {
      if (dentry.startsWith('.')) {
        return;
      }

      const filename = path.join(directory, 'versions', dentry);

      if (fs.lstatSync(filename).isDirectory() || !/\.ya?ml/.test(filename)) {
        return;
      }

      const content = yaml.safeLoad(fs.readFileSync(filename));
      const version = Version.fromYamlFileContent(content, filename);
      if (versions[version.version - 1]) {
        throw new Error(`duplicate version number ${version.version} in ${filename}`);
      }
      versions.length = Math.max(versions.length, version.version);
      versions[version.version - 1] = version;
    });

    // check for missing versions
    for (let i = 0; i < versions.length; i++) {
      assert(versions[i], `version ${i + 1} is missing`);
    }

    Schema._checkMethodUpdates(versions);

    const access = Access.fromYamlFileContent(
      yaml.safeLoad(fs.readFileSync(path.join(directory, 'access.yml'))),
      'access.yml');
    const tables = Relations.fromYamlFileContent(
      yaml.safeLoad(fs.readFileSync(path.join(directory, 'tables.yml'))),
      'tables.yml');

    return new Schema(versions, access, tables);
  }

  /**
   * Load a Schema from a serialized representation
   */
  static fromSerializable(serializable) {
    assert.deepEqual(Object.keys(serializable).sort(), ['access', 'tables', 'versions']);
    return new Schema(
      serializable.versions.map(s => Version.fromSerializable(s)),
      Access.fromSerializable(serializable.access),
      Relations.fromSerializable(serializable.tables),
    );
  }

  /**
   * Create a serialized representation
   */
  asSerializable() {
    return {
      versions: this.versions.map(v => v.asSerializable()),
      access: this.access.asSerializable(),
      tables: this.tables.asSerializable(),
    };
  }

  static _checkMethodUpdates(versions) {
    // verify that no method declarations incorrectly try to change fixed attributes
    // of those methods
    const methods = new Map();
    for (let version of versions) {
      for (let [name, method] of Object.entries(version.methods)) {
        if (methods.has(name)) {
          const existing = methods.get(name);
          method.checkUpdateFrom(name, existing, version);
        } else {
          methods.set(name, method);
        }
      }
    }
  }

  getVersion(version) {
    const v = this.versions[version - 1];

    if (!v) {
      throw new Error(`Version ${version} not found in the schema`);
    }

    return v;
  }

  latestVersion() {
    return this.versions[this.versions.length - 1];
  }

  allMethods() {
    const map = this.versions.reduce(
      (acc, version) => {
        Object.entries(version.methods).forEach(([name, method]) => {
          if (method.deprecated) {
            Object.assign(method, acc.get(name), {deprecated: true});
          }
          acc.set(name, method);
        });
        return acc;
      }, new Map());

    return [...map.values()];
  }
}

module.exports = Schema;
