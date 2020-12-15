const { CdnMiddleware } = require('./cdn');

const MIDDLEWARE_TYPES = {
  cdn: CdnMiddleware,
};

/**
 * A container for all defined backends in a running instance of this service,
 * supporting getting backends either by name or for a newly uploaded object.
 */
class Middleware {
  async setup({ cfg, monitor }) {
    this.monitor = monitor;

    this.instances = (cfg.middleware || []).map((config, i) => {
      const Middleware = MIDDLEWARE_TYPES[config.middlewareType];
      if (!Middleware) {
        throw new Error(`Unknown middlewareType ${config.middlewareType}`);
      }

      return new Middleware({
        monitor: monitor.childMonitor(`middleware.${i}`),
        rootUrl: cfg.taskcluster.rootUrl,
        config,
      });
    });

    for (let mw of this.instances) {
      await mw.setup();
    }

    return this;
  }

  /**
   * Intercept the fetchObjectMetadata API method.  This calls the function
   * of the same name on all middleware objects, in order, until one
   * returns false.
   *
   * See the middleware base class for more details.
   */
  async fetchObjectMetadataRequest(req, res, object, method, params) {
    for (let mw of this.instances) {
      if (!await mw.fetchObjectMetadataRequest(req, res, object, method, params)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Similar to fetchObjectMetadataRequest, but for the simple-download API.
   */
  async downloadRequest(req, res, object) {
    for (let mw of this.instances) {
      if (!await mw.downloadRequest(req, res, object)) {
        return false;
      }
    }

    return true;
  }
}

module.exports = { Middleware, MIDDLEWARE_TYPES };
