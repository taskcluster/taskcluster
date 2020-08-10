const { Provider } = require('./provider');

/**
 * The null provider does absolutely nothing.  It exists only to allow for
 * deletion of worker pools, after they are emptied of existing workers.
 */
class NullProvider extends Provider {
  constructor(conf) {
    super(conf);
    this.configSchema = 'config-null';
  }
}

module.exports = {
  NullProvider,
};
