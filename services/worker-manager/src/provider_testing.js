const {Provider} = require('./provider');

class TestingProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-testing';
  }

  async createResources({workerType}) {
    this.monitor.notice('create-resource', {workerType: workerType.name});
  }

  async updateResources({workerType}) {
    this.monitor.notice('update-resource', {workerType: workerType.name});
  }

  async removeResources({workerType}) {
    this.monitor.notice('remove-resource', {workerType: workerType.name});
  }
}

module.exports = {
  TestingProvider,
};
