const fs = require('fs');
const assert = require('assert');
const yaml = require('js-yaml');
const path = require('path');
const stringify = require('json-stable-stringify');
const {READ, WRITE} = require('./constants');

class Schema{
  /**references
   * Create a new Schema
   *
   * script is a script to create the schema, suitable as an argument to
   * the Postgres DO statment; that is usually 'BEGIN stmt; stmt; .. END'.
   */
  // TODO: Make sure that procedure argument values don't change
  constructor(versions, access) {
    this.versions = versions;
    this.access = access;
  }

  static fromSerializable(serializable) {
    return new Schema(serializable.versions, serializable.access);
  }

  asSerializable() {
    return stringify({
      versions: this.versions,
      access: this.access,
    }, { space: 2 });
  }

  static fromDbDirectory(directory = path.join(__dirname, '../../../db')) {
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
      versions[version.version - 1] = version;
    });

    // check for missing versions
    for (let i = 0; i < versions.length; i++) {
      assert(versions[i], `version ${i + 1} is missing`);
    }

    Schema._checkMethods(versions);

    // TODO: Add test to check for correctly loading access
    const access = yaml.safeLoad(fs.readFileSync(path.join(directory, 'access.yml')));

    return new Schema(versions, access);
  }

  static _checkVersion(version, filename) {
    assert(version.version, `version field missing in ${filename}`);
    assert(version.migrationScript, `migrationScript field missing in ${filename}`);
    assert(version.methods, `methods field missing in ${filename}`);

    assert(Object.keys(version).length, 3, `unknown fields in ${filename}`);

    const fileBase = path.basename(filename, '.yml');
    assert.equal(version.version, Number(fileBase), `filename ${filename} must match version`);

    // TODO: check method forms
  }

  static _checkMethods(versions) {
    const methods = new Map();
    for (let version of versions) {
      for (let [methodName, {mode, serviceName, args, returns}] of Object.entries(version.methods)) {
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

    return this.versions.reduce((acc, version) => {
      Object.entries(version.methods).forEach(([name, { mode, serviceName, args, returns }]) => {
        acc.add({ name, mode: modes[mode], serviceName, args, returns });
      });

      return acc;
    }, new Set());
  }
}

module.exports = Schema;
