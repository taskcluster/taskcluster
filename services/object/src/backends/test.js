const assert = require('assert');
const { Backend } = require('./base');

/**
 * The test backend type is only available when running tests.
 */
class TestBackend extends Backend {
  constructor(options) {
    super(options);
    this.data = new Map();
  }

  async temporaryUpload(object, data) {
    if (TestBackend.failUpload) {
      throw new Error('uhoh');
    }
    this.data.set(object.name, data);
  }

  async availableDownloadMethods(object) {
    if (object.name === 'has/no/methods') {
      return [];
    }
    return ['simple', 'HTTP:GET'];
  }

  async fetchObjectMetadata(object, method, params) {
    assert(this.data.has(object.name));
    switch (method){
      case 'simple': {
        assert.equal(params, true);
        return {
          method,
          url: 'data:;base64,' + this.data.get(object.name).toString('base64'),
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

const toDataUrl = data => 'data:;base64,' + data.toString('base64');

module.exports = { TestBackend, toDataUrl };
