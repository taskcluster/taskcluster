const { Middleware } = require('./base');

class TestMiddleware extends Middleware {
  constructor(options) {
    super(options);
    this.config = options.config;
  }

  async downloadObjectRequest(req, res, object, method, params) {
    switch (object.name) {
      case 'dl/intercept': {
        res.reply({
          method: 'simple',
          details: { url: 'http://intercepted' },
        });
        return false;
      }

      default: return true;
    }
  }

  async simpleDownloadRequest(req, res, object) {
    switch (object.name) {
      case 'simple/intercept': {
        res.redirect(303, 'http://intercepted');
        return false;
      }

      default: return true;
    }
  }
}

module.exports = { TestMiddleware };
