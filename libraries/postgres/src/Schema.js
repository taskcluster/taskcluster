const {isPlainObject} = require('lodash');
const fs = require('fs');
const assert = require('assert').strict;
const yaml = require('js-yaml');
const path = require('path');
const Version = require('./Version');

class Schema{
  constructor(versions, access) {
    this.versions = versions;
    this.access = access;
  }

  static fromSerializable(serializable) {
    assert.deepEqual(Object.keys(serializable).sort(), ['access', 'versions']);
    return new Schema(
      serializable.versions.map(s => Version.fromSerializable(s)),
      serializable.access,
    );
  }

  asSerializable() {
    return {
      versions: this.versions.map(v => v.asSerializable()),
      access: this.access,
    };
  }

  static fromDbDirectory(directory) {
    const dentries = fs.readdirSync(path.join(directory, 'versions'));
    let versions = new Array(dentries.length);

    dentries.forEach(dentry => {
      if (dentry.startsWith('.')) {
        return;
      }

      const filename = path.join(directory, 'versions', dentry);

      if (fs.lstatSync(filename).isDirectory() || !/\.ya?ml/.test(filename)) {
        throw new Error(`${filename} is a directory`);
      }

      const content = yaml.safeLoad(fs.readFileSync(filename));
      const version = Version.fromYamlFile(content, filename);
      if (versions[version.version - 1]) {
        throw new Error(`duplicate version number ${version.version} in ${filename}`);
      }
      versions[version.version - 1] = version;
    });

    // check for missing versions
    for (let i = 0; i < versions.length; i++) {
      assert(versions[i], `version ${i + 1} is missing`);
    }

    Schema._checkMethodUpdates(versions);

    const access = yaml.safeLoad(fs.readFileSync(path.join(directory, 'access.yml')));
    Schema._checkAccess(access);

    return new Schema(versions, access);
  }

  static _checkMethodUpdates(versions) {
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

  static _checkAccess(access) {
    assert(isPlainObject(access), 'access.yml should define an object');
    Object.keys(access).forEach(serviceName => {
      const serviceAccess = access[serviceName];
      assert(isPlainObject(serviceAccess), 'each service in access.yml should define an object');
      assert.deepEqual(Object.keys(serviceAccess).sort(), ['tables'],
        'each service in access.yml should only have a `tables` property');
      assert(isPlainObject(serviceAccess.tables), `${serviceName}.tables should be an object`);
      Object.entries(serviceAccess.tables).forEach(([table, mode]) => {
        assert(['read', 'write'].includes(mode), `${serviceName}.tables.${table} should be read or write`);
      });
    });
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
        Object.entries(version.methods).forEach(([name, method]) => acc.set(name, method));
        return acc;
      }, new Map());

    return [...map.values()];
  }
}

module.exports = Schema;
