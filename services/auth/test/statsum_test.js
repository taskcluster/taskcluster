const helper = require('./helper');
const assert = require('assert');
const testing = require('taskcluster-lib-testing');

helper.secrets.mockSuite(testing.suiteName(), ['app', 'azure', 'gcp'], function(mock, skipping) {
  helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withEntities(mock, skipping);
  helper.withRoles(mock, skipping);
  helper.withServers(mock, skipping);

  test('statsumToken', async () => {
    let result = await helper.apiClient.statsumToken('test');

    assert(result.project === 'test');
    assert(result.token);
    assert(result.baseUrl);
    assert(result.expires);
  });
});
