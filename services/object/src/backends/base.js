class Backend {
  constructor({ backendId, db, monitor, rootUrl, config }) {
    this.backendId = backendId;
    this.db = db;
    this.monitor = monitor;
    this.rootUrl = rootUrl;

    this._matches = config.matches;
  }

  /**
   * Set up this backend.
   *
   * Subclasses should override this.
   */
  async setup() {
  }
}

module.exports = { Backend };
