import _ from 'lodash';
import helper from '../helper.js';
import testing from 'taskcluster-lib-testing';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(import.meta.url)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(`${testing.suiteName()}`, function() {
  helper.withDbForVersion();

  test('clients table created / removed on upgrade and downgrade', async function() {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('clients_entities');
    await helper.assertNoTable('clients');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertNoTable('clients_entities');
    await helper.assertTable('clients');

    await helper.downgradeTo(PREV_VERSION);
    await helper.assertTable('clients_entities');
    await helper.assertNoTable('clients');
  });
});
