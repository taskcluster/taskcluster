import assert from 'assert';
import helper from './helper.js';
import slugid from 'slugid';
import _ from 'lodash';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';

helper.secrets.mockSuite(testing.suiteName(), ['gcp'], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withCfg(mock, skipping);
  helper.withPulse(mock, skipping);
  helper.withServers(mock, skipping);
  helper.resetTables(mock, skipping);

  let clientId;
  clientId = slugid.v4();
  suiteSetup(async function() {
    if (skipping()) {
      this.skip();
    }
  });
  test('get audit history', async() => {
    const entityType = 'client';

    await helper.apiClient.createClient(clientId, {
      expires: taskcluster.fromNowJSON('1 day'),
      description: 'test client...',
      scopes: [],
    });

    await helper.apiClient.updateClient(clientId, {
      expires: taskcluster.fromNowJSON('2 days'),
      description: 'updated description',
      scopes: [],
    });

    const longClientId = 'test/client/id/with/slashes';
    await helper.apiClient.createClient(longClientId, {
      expires: taskcluster.fromNowJSON('2 days'),
      description: 'updated description',
      scopes: [],
    });

    const audit_history = await helper.apiClient.getEntityHistory(entityType, clientId);

    assert.equal(audit_history.auditHistory.length, 2);
    assert.equal(audit_history.auditHistory[0].client_id, 'static/taskcluster/root');
    assert.equal(audit_history.auditHistory[0].action_type, 'created');
    assert.equal(audit_history.auditHistory[1].client_id, 'static/taskcluster/root');
    assert.equal(audit_history.auditHistory[1].action_type, 'updated');

    const audit_history_long = await helper.apiClient.getEntityHistory(entityType, longClientId);

    assert.equal(audit_history_long.auditHistory.length, 1);
    assert.equal(audit_history_long.auditHistory[0].client_id, 'static/taskcluster/root');
    assert.equal(audit_history_long.auditHistory[0].action_type, 'created');
  });
});
