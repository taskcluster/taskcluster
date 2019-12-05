const assert = require('assert');

class Schema{
  /**
   * Create a new Schema
   *
   * script is a script to create the schema, suitable as an argument to
   * the Postgres DO statment; that is usually 'BEGIN stmt; stmt; .. END'.
   */
  constructor({script}, {version, versions, methods} = {}) {
    assert(script, 'script is required');
    this.script = script;

    this.version = version || 1;
    this.versions = versions || [null];

    assert.equal(this.versions.length, this.version);
    this.versions.push(this);

    this.methods = new Map(methods);
  }

  /**
   * Add a new version to this schema; version must be one more than the
   * previous version.  A script must be provided to upgrade from the previous
   * version. All defined methods are reset.
   */
  addVersion(version, script) {
    assert(version === this.version + 1, 'versions must increment by one');
    return new Schema(
      {script},
      {version, versions: this.versions});
  }

  /**
   * Add a new method to this schema version.  Calling the method on the
   * resulting Database instance will invoke the given plpgsql script.  If the
   * method was already defined in a previous version, then its args and
   * returns must match the previous version exactly.
   */
  addMethod(method, rw, args, returns, script) {
    assert(script, 'script is required');
    if (this.methods.has(method)) {
      const prev = this.methods.get(method);
      assert.equal(args, prev.args,
        'method args must match previous version');
      assert.equal(returns, prev.returns,
        'method returns must match previous version');
    }
    this.methods.set(method, {rw, args, returns, script});
    return this;
  }

  /** testing **/

  /**
   * Get the schema as it was at the given version; this is used for testing
   * upgrades from old versions.
   */
  atVersion(version) {
    return this.versions[version];
  }
}

module.exports = Schema;
