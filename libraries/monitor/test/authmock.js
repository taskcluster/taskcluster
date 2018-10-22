const debug = require('debug')('test');
const libUrls = require('taskcluster-lib-urls');
const nock = require('nock');

const testclients = {
  'test-client': ['*'],
};

exports.setup = () => {
  const date = new Date(new Date().getTime() + 24 * 60 * 60 * 1000);
  nock(libUrls.testRootUrl())
    .persist()
    .get(/api\/auth\/v1\/sentry\/tc-lib-monitor\/dsn/)
    .reply(200, function(uri) {
      debug('Responding to request for:', uri);
      return {
        project: 'tc-lib-monitor',
        dsn: {
          secret: 'https://abc:abc@app.getsentry.com/12345',
          public: 'unused',
        },
        expires: date,
      };
    })
    .get(/api\/auth\/v1\/statsum\/tc-lib-monitor\/token/)
    .reply(200, function(uri) {
      debug('Responding to request for:', uri);
      return {
        project: 'tc-lib-monitor',
        token: 'abc123',
        expires: date,
        baseUrl: 'https://statsum.taskcluster.net',
      };
    });
};

exports.teardown = () => {
  nock.cleanAll();
};
