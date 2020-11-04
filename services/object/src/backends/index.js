const BACKEND_TYPES = {
  // TBD!
};

class Backends {
  async setup({ cfg, monitor, db }) {
    this._backends = {};

    if (!cfg.backends) {
      throw new Error('No backends configured');
    }
    for (const [backendId, backendConfig] of Object.entries(cfg.backends)) {
      const Backend = BACKEND_TYPES[backendConfig.backendType];
      if (!Backend) {
        throw new Error(`Unknown backendType ${backendConfig.backendType} selected for backendId ${backendId}.`);
      }
      const backend = new Backend({
        backendId,
        db,
        monitor: monitor.childMonitor(`backend.${backendId}`),
        rootUrl: cfg.taskcluster.rootUrl,
        backendConfig,
      });
      this._backends[backendId] = backend;
      await backend.setup();
    }

    // return self to make this easier to use in a loader component
    return this;
  }

  /**
   * Get a backend by its backendId
   */
  get(backendId) {
    return this._backends[backendId];
  }
}

module.exports = { Backends, BACKEND_TYPES };
