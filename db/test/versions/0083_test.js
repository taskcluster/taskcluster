import { strict as assert } from 'assert';
import helper from '../helper';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('queue worker quarantine details', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('queue_workers');
    await helper.assertNoTableColumn('queue_workers', 'quarantine_details');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('queue_workers');
    await helper.assertTableColumn('queue_workers', 'quarantine_details');
  });

  test('quarantine details function', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    const db = await helper.setupDb('queue');

    await db.fns.queue_worker_seen_with_last_date_active({
      task_queue_id_in: 'prov/wt',
      worker_group_in: 'wg',
      worker_id_in: 'wi',
      expires_in: taskcluster.fromNow('1 day'),
    });

    let worker = await db.fns.get_queue_worker_with_wm_join_2('prov/wt', 'wg', 'wi', taskcluster.fromNow('1 hour'));
    assert.equal(worker[0].quarantine_details, null);

    await db.fns.quarantine_queue_worker_with_last_date_active_and_details(
      'prov/wt', 'wg', 'wi', taskcluster.fromNow('1 day'),
      { clientId: 'c1', updateAt: 'now', quarantineUntil: 'tomorrow', quarantineInfo: 'details' });

    worker = await db.fns.get_queue_worker_with_wm_join_2('prov/wt', 'wg', 'wi', taskcluster.fromNow('1 hour'));
    assert.equal(worker[0].quarantine_details.length, 1);
    assert.equal(worker[0].quarantine_details[0].clientId, 'c1');
    assert.equal(worker[0].quarantine_details[0].updateAt, 'now');
    assert.equal(worker[0].quarantine_details[0].quarantineUntil, 'tomorrow');
    assert.equal(worker[0].quarantine_details[0].quarantineInfo, 'details');

    // records should be appended
    await db.fns.quarantine_queue_worker_with_last_date_active_and_details(
      'prov/wt', 'wg', 'wi', taskcluster.fromNow('5 days'),
      { clientId: 'c2', updateAt: 'now+1', quarantineUntil: 'tomorrow+1', quarantineInfo: 'details+1' });

    worker = await db.fns.get_queue_worker_with_wm_join_2('prov/wt', 'wg', 'wi', taskcluster.fromNow('1 hour'));
    assert.equal(worker[0].quarantine_details.length, 2);
    assert.equal(worker[0].quarantine_details[0].clientId, 'c1');
    assert.equal(worker[0].quarantine_details[1].clientId, 'c2');
    assert.equal(worker[0].quarantine_details[0].updateAt, 'now');
    assert.equal(worker[0].quarantine_details[1].updateAt, 'now+1');
    assert.equal(worker[0].quarantine_details[0].quarantineUntil, 'tomorrow');
    assert.equal(worker[0].quarantine_details[1].quarantineUntil, 'tomorrow+1');
    assert.equal(worker[0].quarantine_details[0].quarantineInfo, 'details');
    assert.equal(worker[0].quarantine_details[1].quarantineInfo, 'details+1');
  });
});
