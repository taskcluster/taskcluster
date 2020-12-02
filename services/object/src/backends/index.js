const { AwsBackend } = require('./aws');

const BACKEND_TYPES = {
  aws: AwsBackend,
};

/**
 * A container for all defined backends in a running instance of this service,
 * supporting getting backends either by name or for a newly uploaded object.
 */
class Backends {
  async setup({ cfg, monitor, db }) {
    this.monitor = monitor;

    await this._setupBackends({ cfg, monitor, db });
    await this._setupMatching({ cfg });

    return this;
  }

  async _setupBackends({ cfg, monitor, db }) {
    this._backends = new Map();

    if (!cfg.backends) {
      throw new Error('No backends configured');
    }

    let loopOver = false;

    while(!loopOver){

    for (const [backendId, config] of Object.entries(cfg.backends)) {
      const Backend = BACKEND_TYPES[config.backendType];

      if (!Backend) {
        throw new Error(`Unknown backendType ${config.backendType} selected for backendId ${backendId}.`);
      }

      const backend = new Backend({
        backendId,
        db,
        monitor: monitor.childMonitor(`backend.${backendId}`),
        rootUrl: cfg.taskcluster.rootUrl,
        config,
      });
      this._backends.set(backendId, backend);
      
      try{
        await backend.setup();
      }catch(err){
        this.monitor.reportError(new Error(err.message));
        continue;
      }
    
    }
    
    }
  }

  async _setupMatching({ cfg }) {
    // the config processing stuff defaults this to an empty object, rather than an
    // emtpy array, so coerce to be friendly
    let backendMap = cfg.backendMap;
    if (typeof backendMap === 'object' && !Array.isArray(backendMap)) {
      backendMap = Object.entries(backendMap);
      if (backendMap.length > 0) {
        throw new Error('backendMap must be an array, not an object');
      }
    }

    // construct matcher functions for each backendMap element; each taking an object and
    // returning either a backendId or null
    this._matchers = backendMap.map(({ backendId, when }, i) => {
      if (!backendId || !when) {
        throw new Error(`backendMap[${i}] is missing backendId or when`);
      }
      if (!this._backends.has(backendId)) {
        throw new Error(`backendMap[${i}] has invalid backendId ${backendId}`);
      }

      if (when === 'all') {
        // [].every(..) is true, so this will always match
        when = {};
      }

      const makePatternFn = pattern => {
        if (typeof pattern === 'string') {
          return value => value === pattern;
        }
        if (pattern.regexp) {
          const re = new RegExp(pattern.regexp);
          return re.test.bind(re);
        }
        if (pattern.is) {
          return value => value === pattern.is;
        }
        throw new Error(`backendMap[${i}] has invalid pattern ${JSON.stringify(pattern)}`);
      };

      const conditions = Object.entries(when).map(([param, pattern]) => {
        const patternFn = makePatternFn(pattern);
        switch (param) {
          case 'projectId': return object => patternFn(object.projectId);
          case 'name': return object => patternFn(object.name);
          default: throw new Error(`backendMap[${i}] has invalid match parameter ${param}`);
        }
      });

      return object => (conditions.every(p => p(object)) ? backendId : null);
    });
  }

  /**
   * Get a backend by its backendId
   */
  get(backendId) {
    return this._backends.get(backendId);
  }

  /**
   * Get the backend to use for this upload
   */
  forUpload(upload) {
    for (let matcher of this._matchers) {
      const backendId = matcher(upload);
      if (backendId) {
        return this.get(backendId);
      }
    }
  }
}

module.exports = { Backends, BACKEND_TYPES };
