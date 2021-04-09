const assert = require('assert');
const { Backend } = require('./base');
const { reportError } = require('taskcluster-lib-api');

/**
 * The test backend type is only available when running tests.
 */
class TestBackend extends Backend {
  constructor(options) {
    super(options);
    this.data = new Map();
  }

  async createUpload(object, proposedUploadMethods) {
    if (TestBackend.failUpload) {
      throw new Error('uhoh');
    }

    if ('dataInline' in proposedUploadMethods) {
      return await this.createDataInlineUpload(object, proposedUploadMethods.dataInline);
    }

    return {};
  }

  async createDataInlineUpload(object, { objectData }) {
    let bytes;
    try {
      bytes = Buffer.from(objectData, 'base64');
    } catch (err) {
      return reportError('InputError', 'Invalid base64 objectData', {});
    }

    this.data.set(object.name, bytes);

    return { dataInline: true };
  }

  async availableDownloadMethods(object) {
    if (object.name === 'has/no/methods') {
      return [];
    }
    return ['simple'];
  }

  async startDownload(object, method, params) {
    assert(this.data.has(object.name));
    switch (method){
      case 'simple': {
        assert.equal(params, true);
        return {
          method,
          url: 'data:;base64,' + this.data.get(object.name).toString('base64'),
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
