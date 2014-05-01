var Provider = require('nconf').Provider;

module.exports = function config() {
  var nconf = new Provider();
  nconf.overrides({
    server: {
      // XXX: Start of not conflicting staging with tests.
      port: 600235
    }
  });
  // defaults
  nconf.defaults(require('./defaults'));
  return nconf;
};

