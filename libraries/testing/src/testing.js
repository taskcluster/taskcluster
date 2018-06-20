exports.PulseTestReceiver    = require('./pulse');
exports.schemas              = require('./schemas');
exports.fakeauth             = require('./fakeauth');
exports.stickyLoader         = require('./stickyloader');
exports.Secrets              = require('./secrets');
exports.poll                 = require('./poll');
exports.sleep                = require('./sleep');

exports.createMockAuthServer = () => {
  throw new Error('No longer available; use fakeauth instead');
};
