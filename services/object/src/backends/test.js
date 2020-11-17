const assert = require('assert');
const { Backend } = require('./base');

/**
 * The test backend type is only available when running tests.
 */
class TestBackend extends Backend {
  async availableDownloadMethods(object) {
    if (object.name === 'has/no/methods') {
      return [];
    }
    return ['simple', 'HTTP:GET'];
  }

  async downloadObject(object, method, params) {
    switch (method){
      case 'simple': {
        assert.equal(params, true);
        return {
          method,
          url: 'https://example.com',
        };
      }

      case 'HTTP:GET': {
        assert.equal(params, true);
        return {
          method,
          details: {
            url: 'https://google.ca',
          },
        };
      }

      default: {
        throw new Error(`unknown download method ${method}`);
      }
    }
  }

  async expireObject(object) {
    switch (object.data.expirationReturns) {
      case 'fail': throw new Error('uhoh');
      case false: return false;
      case true: return true;
      default: return true;
    }
  }
}

module.exports = { TestBackend };
