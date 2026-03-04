import assert from 'assert';
import helper from './helper.js';
import slugid from 'slugid';
import _ from 'lodash';
import testing from '@taskcluster/lib-testing';
import taskcluster from '@taskcluster/client';

helper.secrets.mockSuite('audit', ['gcp'], function(mock, skipping) {
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

  setup(async function() {
    await testing.resetTables({ tableNames: [
      'audit_history',
    ] });
  });

  test('get audit history', async() => {
    const entityType = 'client';

    await helper.apiClient.createClient(clientId, {
      expires: taskcluster.fromNowJSON('1 day'),
      description: 'test client...',
      scopes: [`auth:audit-history:${entityType}`],
    });

    await helper.apiClient.updateClient(clientId, {
      expires: taskcluster.fromNowJSON('2 days'),
      description: 'updated description',
      scopes: [`auth:audit-history:${entityType}`],
    });

    const longClientId = 'test/client/id/with/slashes';
    await helper.apiClient.createClient(longClientId, {
      expires: taskcluster.fromNowJSON('2 days'),
      description: 'updated description',
      scopes: [],
    });

    const audit_history = await helper.apiClient.getEntityHistory(entityType, clientId);

    assert.equal(audit_history.auditHistory.length, 2);
    assert.equal(audit_history.auditHistory[0].clientId, 'static/taskcluster/root');
    assert.equal(audit_history.auditHistory[0].actionType, 'created');
    assert.equal(audit_history.auditHistory[1].clientId, 'static/taskcluster/root');
    assert.equal(audit_history.auditHistory[1].actionType, 'updated');

    const audit_history_long = await helper.apiClient.getEntityHistory(entityType, longClientId);

    assert.equal(audit_history_long.auditHistory.length, 1);
    assert.equal(audit_history_long.auditHistory[0].clientId, 'static/taskcluster/root');
    assert.equal(audit_history_long.auditHistory[0].actionType, 'created');
  });

  test('list client audit history', async() => {

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

    const audit_history = await helper.apiClient.listAuditHistory('static/taskcluster/root');

    assert.equal(audit_history.auditHistory.length, 2);
    assert.equal(audit_history.auditHistory[0].clientId, 'static/taskcluster/root');
    assert.equal(audit_history.auditHistory[0].actionType, 'created');
    assert.equal(audit_history.auditHistory[1].clientId, 'static/taskcluster/root');
    assert.equal(audit_history.auditHistory[1].actionType, 'updated');
  });
});
