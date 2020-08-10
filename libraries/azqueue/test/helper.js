const { Secrets, withDb } = require('taskcluster-lib-testing');

exports.secrets = new Secrets({
  secretName: [],
  secrets: {
    db: withDb.secret,
  },
  load: exports.load,
});

exports.withDb = (mock, skipping) => {
  withDb(mock, skipping, exports, 'queue');
};
