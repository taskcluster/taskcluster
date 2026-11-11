import assert from 'node:assert';
import { Middleware } from './base.js';

const isAddressableName = name => !name.split('/').some(segment => segment === '.' || segment === '..');

// also encode `?` and `#`
const encodeName = name => encodeURI(name).replace(/[?#]/g, encodeURIComponent);

export class CdnMiddleware extends Middleware {
  constructor(options) {
    super(options);
    const { config } = options;
    assert(config.regexp, 'regexp is required for cdn middleware');
    this.regexp = new RegExp(config.regexp);

    assert(config.baseUrl, 'baseUrl is required for cdn middleware');
    this.baseUrl = config.baseUrl;
  }

  async downloadRequest(_req, res, object) {
    // If the regular expression matches, then redirect to the CDN URL instead of
    // allowing the backend URL to serve this request.  Names with `.` or `..`
    // segments are left to the backend, as URL parsers would resolve them.
    if (this.regexp.test(object.name) && isAddressableName(object.name)) {
      res.redirect(303, this.baseUrl + encodeName(object.name));
      return false;
    }

    return true;
  }
}

export default { CdnMiddleware };
