const assert = require('assert');
const { Middleware } = require('./base.js');

class CdnMiddleware extends Middleware {
  constructor(options) {
    super(options);
    const { config } = options;
    assert(config.regexp, 'regexp is required for cdn middleware');
    this.regexp = new RegExp(config.regexp);

    assert(config.baseUrl, 'baseUrl is required for cdn middleware');
    this.baseUrl = config.baseUrl;
  }

  async simpleDownloadRequest(req, res, object) {
    // If the regular expression matches, then redirect to the CDN URL instead of
    // allowing the backend URL to serve this request.
    if (this.regexp.test(object.name)) {
      res.redirect(303, this.baseUrl + object.name);
      return false;
    }

    return true;
  }
}

module.exports = { CdnMiddleware };
