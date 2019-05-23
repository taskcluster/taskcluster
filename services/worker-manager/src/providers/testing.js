const {Provider} = require('./provider');

class TestingProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-testing';
  }

  async createResources({workerType}) {
    this.monitor.notice('create-resource', {workerTypeName: workerType.workerTypeName});
  }

  async updateResources({workerType}) {
    this.monitor.notice('update-resource', {workerTypeName: workerType.workerTypeName});
  }

  async removeResources({workerType}) {
    this.monitor.notice('remove-resource', {workerTypeName: workerType.workerTypeName});
  }
}

module.exports = {
  TestingProvider,
};
