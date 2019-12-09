const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

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
    return new Schema(new Map(
      Object.values(serializable.versions)
        .map(vers => ([vers.version, vers])),
    ));
  }

  static fromDbDirectory(directory) {
    const versions = new Map();

    fs.readdirSync(directory).forEach(dentry => {
      if (dentry.startsWith('.')) {
        return;
      }

      const filename = path.join(directory, dentry);

      if (fs.lstatSync(filename).isDirectory() || !/\.ya?ml/.test(filename)) {
        throw new Error(`${filename} is a directory`);
      }

      const version = yaml.safeLoad(fs.readFileSync(filename));

      versions.set(version.version, version);
    });

    return new Schema(versions);
  }

  getVersion(version) {
    const v = this.versions.get(version);

    if (!v) {
      throw new Error(`Version ${version} not found in the schema`);
    }

    return v;
  }

  latestVersion() {
    return this.versions.get(Math.max(...this.versions.keys()));
  }

  allMethods() {
    return [...this.versions.values()].reduce((acc, version) => {
      Object.entries(version.methods).forEach(([name, { mode }]) => {
        acc.add({ name, mode });
      });

      return acc;
    }, new Set());
  }
}

module.exports = Schema;
