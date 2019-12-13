const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');
const {READ, WRITE} = require('./constants');

class Schema{
  /**references
   * Create a new Schema
   *
   * script is a script to create the schema, suitable as an argument to
   * the Postgres DO statment; that is usually 'BEGIN stmt; stmt; .. END'.
   */
  // TODO: Make sure that versions are contiguous
  // TODO: Make sure that procedure argument values don't change
  constructor(versions) {
    this.versions = versions;
  }

  static fromSerializable(serializable) {
    return new Schema(serializable.versions);
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

      versions[version.version - 1] = version;
    });

    return new Schema(versions);
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
      Object.entries(version.methods).forEach(([name, { mode, serviceName }]) => {
        acc.add({ name, mode: modes[mode], serviceName });
      });

      return acc;
    }, new Set());
  }
}

module.exports = Schema;
