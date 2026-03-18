import { Middleware } from './base.js';

export class TestMiddleware extends Middleware {
  constructor(options) {
    super(options);
    this.config = options.config;
  }

  async startDownloadRequest(_req, res, object, _method, _params) {
    switch (object.name) {
      case 'dl/intercept': {
        res.reply({
          method: 'simple',
          url: 'http://intercepted',
        });
        return false;
      }

      default:
        return true;
    }
  }

  async downloadRequest(_req, res, object) {
    switch (object.name) {
      case 'simple/intercept': {
        res.redirect(303, 'http://intercepted');
        return false;
      }

      default:
        return true;
    }
  }
}

export default { TestMiddleware };
