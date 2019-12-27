const {isPlainObject} = require('lodash');
const fs = require('fs');
const assert = require('assert').strict;
const yaml = require('js-yaml');
const path = require('path');
const {READ, WRITE} = require('./constants');

class Schema{
  constructor(versions, access) {
    this.versions = versions;
    this.access = access;
  }

  static fromSerializable(serializable) {
    assert.deepEqual(Object.keys(serializable).sort(), ['access', 'versions']);
    return new Schema(serializable.versions, serializable.access);
  }

  asSerializable() {
    return {
      versions: this.versions,
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

      const version = yaml.safeLoad(fs.readFileSync(filename));
      Schema._checkVersion(version, filename);
      if (versions[version.version - 1]) {
        throw new Error(`duplicate version number ${version.version} in ${filename}`);
      }
      versions[version.version - 1] = version;
    });

    // check for missing versions
    for (let i = 0; i < versions.length; i++) {
      assert(versions[i], `version ${i + 1} is missing`);
    }

    Schema._checkMethods(versions);

    const access = yaml.safeLoad(fs.readFileSync(path.join(directory, 'access.yml')));
    Schema._checkAccess(access);

    return new Schema(versions, access);
  }

  static _checkVersion(version, filename) {
    assert(version.version, `version field missing in ${filename}`);
    assert(version.migrationScript, `migrationScript field missing in ${filename}`);
    assert(version.methods, `methods field missing in ${filename}`);

    assert(Object.keys(version).length, 3, `unknown fields in ${filename}`);

    const fileBase = path.basename(filename, '.yml');
    assert.equal(version.version, Number(fileBase), `filename ${filename} must match version`);

    Object.keys(version.methods).forEach(name => {
      assert(!/.*[A-Z].*/.test(name), `db procedure method ${name} in ${filename} has capital letters`);
      const method = version.methods[name];

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

  static _checkMethods(versions) {
    const methods = new Map();
    for (let version of versions) {
      for (let [methodName, {mode, serviceName, args, returns}] of Object.entries(version.methods)) {
        // ensure that quoting of identifiers is correct
        if (methods.has(methodName)) {
          const existing = methods.get(methodName);
          assert.equal(existing.mode, mode, `method ${methodName} changed mode in version ${version.version}`);
          assert.equal(existing.serviceName, serviceName, `method ${methodName} changed serviceName in version ${version.version}`);
          assert.equal(existing.args, args, `method ${methodName} changed args in version ${version.version}`);
          assert.equal(existing.returns, returns, `method ${methodName} changed returns in version ${version.version}`);
        } else {
          methods.set(methodName, {mode, serviceName, args, returns});
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
    const modes = {read: READ, write: WRITE};

    const map = this.versions.reduce((acc, version) => {
      Object.entries(version.methods).forEach(([name, { mode, serviceName, args, returns, description }]) => {
        acc.set(name, {
          name,
          mode: modes[mode],
          serviceName,
          args,
          returns,
          description,
        });
      });

      return acc;
    }, new Map());

    return [...map.values()];
  }
}

module.exports = Schema;
