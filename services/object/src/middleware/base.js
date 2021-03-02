class Middleware {
  constructor({ monitor, rootUrl, config }) {
    this.monitor = monitor;
    this.rootUrl = rootUrl;
  }

  /**
   * Set up this middleware instance
   *
   * Subclasses should override this, if necessary
   */
  async setup() {
  }

  /**
   * Intercept the startDownload API method.
   *
   * The object, method, and params arguments are those that would
   * be passed to `backend.startDownload`.
   *
   * If this method returns `false`, then the API implementation will
   * return immediately without further action; this indicates that the
   * method has handled the HTTP response (e.g., with `res.reply` or
   * `res.reportError` or the like).  Otherwise, processing will
   * continue with subsequent middleware objects and with the backend.
   *
   * Subclasses may override this method; the default does nothing.
   */
  async startDownloadRequest(req, res, object, method, params) {
    return true;
  }

  /**
   * Similar to startDownloadRequest, but for the simple-download API.
   */
  async downloadRequest(req, res, object) {
    return true;
  }
}

module.exports = { Middleware };
