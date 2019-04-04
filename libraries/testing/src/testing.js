exports.schemas = require('./schemas');
exports.fakeauth = require('./fakeauth');
exports.stickyLoader = require('./stickyloader');
exports.Secrets = require('./secrets');
exports.poll = require('./poll');
exports.sleep = require('./sleep');
exports.withEntity = require('./with-entity');
exports.suiteName = require('./suite-name');

exports.createMockAuthServer = () => {
  throw new Error('No longer available; use fakeauth instead');
};
