const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const assume = require('assume');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), function() {
  helper.secrets.mockSuite('expires_test.js', [], function(mock, skipping) {
    helper.withDb(mock, skipping);
    helper.withEntities(mock, skipping);
    helper.resetTables(mock, skipping);

    test('expire nothing', async function() {
      const count = await helper.LastFire.expires(helper.Hook, new Date());
      assume(count).to.equal(0);
    });

    test('keep only 5 most recent lastfires for each hookId', async function() {
      const hookGroupId = 'testHookGroup';
      const hookId1 = 'testhook';
      const hookId2 = 'testhook2';
      const hookIdToTaskIds = { [hookId1]: [], [hookId2]: [] };
      const hook = {
        hookGroupId,
        hookId: hookId1,
        task: {},
        metadata: {},
        bindings: [],
        schedule: {},
        triggerToken: taskcluster.slugid(),
        lastFire: {},
        nextTaskId: taskcluster.slugid(),
        nextScheduledDate: new Date(2000, 0, 0, 0, 0, 0, 0),
        triggerSchema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              default: 'Niskayuna, NY',
            },
          },
          additionalProperties: false,
        },
      };
      await helper.Hook.create(hook);
      await helper.Hook.create({...hook, hookId: hookId2});
      const entity = {
        hookGroupId,
        hookId: '',
        firedBy: 'expires-test',
        result: 'success',
        error: '',
      };
      for (const hookId of [hookId1, hookId2]) {
        let now = new Date().getTime();
        for(let i = 0; i < 12;i++) {
          hookIdToTaskIds[hookId].push(taskcluster.slugid());
          await helper.LastFire.create({...entity, hookId,
            taskId: hookIdToTaskIds[hookId][i],
            // increase by one because a loop runs in no time
            taskCreateTime: new Date(now++)});
        }
      }

      await testing.sleep(10);
      const count = await helper.LastFire.expires(helper.Hook, new Date(), 5);
      assume(count).to.equal(14);

      for (let hookId of [hookId1, hookId2] ) {
        const recentTaskIds = [];
        await helper.LastFire.query({
          hookGroupId,
          hookId },
        {
          handler: async lastFire => {
            const item = await lastFire.definition();
            const { taskId } = item;
            recentTaskIds.push(taskId);
          },
        },
        );
        hookIdToTaskIds[hookId].splice(0, 7);
        assume(recentTaskIds.sort()).eql(hookIdToTaskIds[hookId].sort());
      }
    });
  });
});
