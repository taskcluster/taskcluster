const {Provider} = require('./provider');

class TestingProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-testing';
  }
}

module.exports = {
  TestingProvider,
};
