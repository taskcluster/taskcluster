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
    helper.fakeDb.github.reset();
  });

  suite('github_builds', function() {

    helper.dbTest('create and get', async function(db, isFake) {
      const task_group_id = 'foobar';
      const build = {
        organization: 'org',
        repository: 'repo',
        sha: 'sha',
        task_group_id,
        state: 'success',
        created: fromNow('-1 week'),
        updated: fromNow(),
        installation_id: 1234,
        event_type: 'something',
        event_id: 'whatever',
      };
      await db.fns.create_github_build(
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
      const [fetched] = await db.fns.get_github_build(task_group_id);
      assert(fetched.etag);
      delete fetched.etag;
      assert.deepEqual(fetched, build);
    });
    helper.dbTest('list', async function(db, isFake) {
      const task_group_prefix = 'foobar';
      const builds = [];
      for (let i = 0; i < 10; i++) {
        builds[i] = {
          organization: 'org',
          repository: 'repo',
          sha: slugid.v4(),
          task_group_id: `${task_group_prefix}-${i}`,
          state: 'success',
          created: fromNow('-1 week'),
          updated: fromNow(),
          installation_id: 1234,
          event_type: 'something',
          event_id: 'whatever',
        };
        await db.fns.create_github_build(
          builds[i].organization,
          builds[i].repository,
          builds[i].sha,
          builds[i].task_group_id,
          builds[i].state,
          builds[i].created,
          builds[i].updated,
          builds[i].installation_id,
          builds[i].event_type,
          builds[i].event_id,
        );
      }
      const fetched = await db.fns.get_github_builds(null, null);
      assert.equal(fetched.length, 10);
      fetched.forEach((build, i) => {
        assert(build.etag);
        delete build.etag;
        assert.deepEqual(build, builds[i]);
      });
    });
    helper.dbTest('delete', async function(db, isFake) {
      const task_group_id = 'foobar';
      const build = {
        organization: 'org',
        repository: 'repo',
        sha: 'sha',
        task_group_id,
        state: 'success',
        created: fromNow('-1 week'),
        updated: fromNow(),
        installation_id: 1234,
        event_type: 'something',
        event_id: 'whatever',
      };
      await db.fns.create_github_build(
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
      const [fetched] = await db.fns.get_github_build(task_group_id);
      assert(fetched.etag);
      delete fetched.etag;
      assert.deepEqual(fetched, build);
      await db.fns.delete_github_build(task_group_id);
      assert.deepEqual(await db.fns.get_github_build(task_group_id), []);
    });
    helper.dbTest('update', async function(db, isFake) {
      const task_group_id = 'foobar';
      const build = {
        organization: 'org',
        repository: 'repo',
        sha: 'sha',
        task_group_id,
        state: 'success',
        created: fromNow('-1 week'),
        updated: fromNow(),
        installation_id: 1234,
        event_type: 'something',
        event_id: 'whatever',
      };
      await db.fns.create_github_build(
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
      const [fetched] = await db.fns.get_github_build(task_group_id);
      await db.fns.update_github_build(
        build.organization,
        build.repository,
        build.sha,
        build.task_group_id,
        'failure',
        build.created,
        build.updated,
        build.installation_id,
        build.event_type,
        build.event_id,
      );
      const [updated] = await db.fns.get_github_build(task_group_id);
      assert.notEqual(fetched.etag, updated.etag);
      assert.equal(fetched.state, 'success');
      assert.equal(updated.state, 'failure');
      delete fetched.etag;
      delete updated.etag;
      delete fetched.state;
      delete updated.state;
      assert.deepEqual(fetched, updated);
    });
    helper.dbTest('set state', async function(db, isFake) {
      const task_group_id = 'foobar';
      const build = {
        organization: 'org',
        repository: 'repo',
        sha: 'sha',
        task_group_id,
        state: 'success',
        created: fromNow('-1 week'),
        updated: fromNow(),
        installation_id: 1234,
        event_type: 'something',
        event_id: 'whatever',
      };
      await db.fns.create_github_build(
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
      const [fetched] = await db.fns.get_github_build(task_group_id);
      await db.fns.set_github_build_state(
        build.task_group_id,
        'huh',
      );
      const [updated] = await db.fns.get_github_build(task_group_id);
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
    });
  });
});
