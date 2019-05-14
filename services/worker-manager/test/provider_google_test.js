const helper = require('./helper');
const {GoogleProvider} = require('../src/provider_google');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['taskcluster', 'azure'], function(mock, skipping) {
  helper.withEntities(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withFakeNotify(mock, skipping);

  let provider;

  setup(async function() {
    provider = new GoogleProvider({
      name: 'google',
      notify: await helper.load('notify'),
      monitor: (await helper.load('monitor')).childMonitor('google'),
      provisionerId: 'whatever',
      //rootUrl: ,
      //taskclusterCredentials: cfg.taskcluster.credentials,
      //estimator,
      //Worker,
      //validator,
      //...meta,
    });
    await provider.initiate();
  });

  teardown(async function() {
    await provider.terminate();
  });

  test('something or other', function() {
  });
});
