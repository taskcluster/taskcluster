const assert = require('assert').strict;
const testing = require('taskcluster-lib-testing');
const { fromNow } = require('taskcluster-client');
const helper = require('../helper');
const slugid = require('slugid');

suite(testing.suiteName(), function() {
  helper.withDbForProcs({ serviceName: 'github' });

  setup('reset table', async function() {
    await helper.withDbClient(async client => {
      await client.query('delete from github_builds');
    });
  });

  suite('github_builds', function() {
    const task_group_prefix = 'foobar';
    const builds = [];
    for (let i = 0; i < 10; i++) {
      builds[i] = {
        organization: 'org',
        repository: 'repo',
        sha: slugid.v4(),
        task_group_id: `${task_group_prefix}-${i}`,
        state: 'success',
        created: fromNow(`-${i} weeks`),
        updated: fromNow(`-${i} days`),
        installation_id: 1234,
        event_type: 'something',
        event_id: 'whatever',
      };
    }

    const create_build = async (db, build) => await db.fns.create_github_build(
      build.organization,
      build.repository,
      build.sha,
      build.task_group_id,
      build.state,
      build.created,
      build.updated,
      build.installation_id,
      build.event_type,
      build.event_id,
    );

    helper.dbTest('create and get', async function(db, isFake) {
      await create_build(db, builds[0]);
      const [fetched] = await db.fns.get_github_build(builds[0].task_group_id);
      assert(fetched.etag);
      delete fetched.etag;
      assert.deepEqual(fetched, builds[0]);

      assert.deepEqual([], await db.fns.get_github_build(null));
      assert.deepEqual([], await db.fns.get_github_build('doesntexist'));

      await assert.rejects(async () => {
        await create_build(db, builds[0]);
      }, /duplicate key value violates unique constraint/);
    });
    helper.dbTest('list', async function(db, isFake) {
      for (let i = 0; i < 10; i++) {
        await create_build(db, builds[i]);
      }
      const fetched = await db.fns.get_github_builds(null, null, null, null, null);
      assert.equal(fetched.length, 10);
      fetched.forEach((build, i) => {
        assert(build.etag);
        delete build.etag;
        assert.deepEqual(build, builds[builds.length - i - 1]);
      });
    });
    helper.dbTest('delete', async function(db, isFake) {
      await create_build(db, builds[0]);
      const [fetched] = await db.fns.get_github_build(builds[0].task_group_id);
      assert(fetched.etag);
      delete fetched.etag;
      assert.deepEqual(fetched, builds[0]);
      await db.fns.delete_github_build(builds[0].task_group_id);
      assert.deepEqual(await db.fns.get_github_build(builds[0].task_group_id), []);
    });
    helper.dbTest('set state', async function(db, isFake) {
      await create_build(db, builds[0]);
      const [fetched] = await db.fns.get_github_build(builds[0].task_group_id);
      await db.fns.set_github_build_state(
        builds[0].task_group_id,
        'huh',
      );
      const [updated] = await db.fns.get_github_build(builds[0].task_group_id);
      assert.notEqual(fetched.etag, updated.etag);
      assert.notEqual(fetched.updated, updated.updated);
      assert.equal(fetched.state, 'success');
      assert.equal(updated.state, 'huh');
      delete fetched.etag;
      delete updated.etag;
      delete fetched.state;
      delete updated.state;
      delete fetched.updated;
      delete updated.updated;
      assert.deepEqual(fetched, updated);

      // Now check that it throws if you try to updated something not there
      await assert.rejects(async () => {
        await db.fns.set_github_build_state(
          'notagroup',
          'huh',
        );
      }, /no such row/);
    });
  });
});
