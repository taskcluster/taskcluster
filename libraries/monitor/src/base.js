const utils = require('./utils');

class BaseMonitor {
  constructor() {
    this.process = null;
  }

  /**
   * captureError is an alias for reportError to match up
   * with the raven api better.
   */
  async captureError(err, level='error', tags={}) {
    return this.reportError(err, level, tags);
  }

  timer(key, funcOrPromise) {
    return utils.timer(this, key, funcOrPromise);
  }

  timedHandler(name, handler) {
    return utils.timedHandler(this, name, handler);
  }

  expressMiddleware(name) {
    return utils.expressMiddleware(this, name);
  }

  timeKeeper(name) {
    return new utils.TimeKeeper(this, name);
  }

  /**
   * Patch an AWS service (an instance of a service from aws-sdk)
   */
  patchAWS(service) {
    utils.patchAWS(this, service);
  }

  resources(process, interval = 10) {
    this._process = process;
    return utils.resources(this, process, interval);
  }

  stopResourceMonitoring() {
    clearInterval(this._resourceInterval);
  }
}

module.exports = BaseMonitor;
