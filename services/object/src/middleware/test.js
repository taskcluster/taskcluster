import { Middleware } from './base.js';

export class TestMiddleware extends Middleware {
  constructor(options) {
    super(options);
    this.config = options.config;
  }

  async startDownloadRequest(req, res, object, method, params) {
    switch (object.name) {
      case 'dl/intercept': {
        res.reply({
          method: 'simple',
          url: 'http://intercepted',
        });
        return false;
      }

      default: return true;
    }
  }

  async downloadRequest(req, res, object) {
    switch (object.name) {
      case 'simple/intercept': {
        res.redirect(303, 'http://intercepted');
        return false;
      }

      default: return true;
    }
  }
}

export default { TestMiddleware };
