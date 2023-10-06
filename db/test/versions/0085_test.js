import { strict as assert } from 'assert';
import helper from '../helper';
import testing from 'taskcluster-lib-testing';
import taskcluster from 'taskcluster-client';

const THIS_VERSION = parseInt(/.*\/0*(\d+)_test\.js/.exec(__filename)[1]);
const PREV_VERSION = THIS_VERSION - 1;

suite(testing.suiteName(), function () {
  helper.withDbForVersion();

  test('github_builds with pull request number', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(PREV_VERSION);

    await helper.assertTable('github_builds');
    await helper.assertNoTableColumn('github_builds', 'pull_request_number');

    await helper.upgradeTo(THIS_VERSION);
    await helper.assertTable('github_builds');
    await helper.assertTableColumn('github_builds', 'pull_request_number');
  });

  test('github functions use new column', async function () {
    await testing.resetDb({ testDbUrl: helper.dbUrl });
    await helper.upgradeTo(THIS_VERSION);
    const db = await helper.setupDb('github');

    await db.fns.create_github_build_pr({
      organization_in: 'org2',
      repository_in: 'repo',
      sha_in: 'abcdef123',
      task_group_id_in: 'taskGroupId',
      state_in: 'running',
      created_in: taskcluster.fromNow('-1 day'),
      updated_in: taskcluster.fromNow('1 second'),
      installation_id_in: 123,
      event_type_in: 'evt',
      event_id_in: 'evt123',
      pull_request_number_in: 2345,
    });

    const builds = await db.fns.get_github_builds_pr({
      page_size_in: 10,
      page_offset_in: 0,
      organization_in: 'org2',
      repository_in: 'repo',
      sha_in: null,
      pull_request_number_in: 2345,
    });

    assert.equal(builds.length, 1);
    assert.equal(builds[0].pull_request_number, 2345);

    const [build] = await db.fns.get_github_build_pr(builds[0].task_group_id);
    assert.equal(build.pull_request_number, 2345);
  });
});
