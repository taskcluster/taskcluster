class Backend {
  constructor({ backendId, db, monitor, rootUrl, backendConfig }) {
    this.backendId = backendId;
    this.db = db;
    this.monitor = monitor;
    this.rootUrl = rootUrl;
    this.backendConfig = backendConfig;
  }
  async setup() {
  }
}

module.exports = { Backend };
