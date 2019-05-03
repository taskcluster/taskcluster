const {Provider} = require('./provider');

class StaticProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-static';
  }
}

module.exports = {
  StaticProvider,
};
