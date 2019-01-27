const helper = require('./helper');
const taskcluster = require('taskcluster-client');
const assume = require('assume');

suite('expires_test', function() {
  helper.secrets.mockSuite('expires_test.js', ['taskcluster'], function(mock, skipping) {
    helper.withLastFire(mock, skipping);

    test('expire nothing', async function() {
      const count = await helper.LastFire.expires(new Date());
      assume(count).to.equal(0);
    });

    test('keep only 5 most recent lastfire', async function() {
      const taskIds = [];
      let entity = {
        hookGroupId: 'testHookGroup',
        hookId: 'testhook',
        firedBy: 'expires-test',
        result: 'success',
        error: '',
      };
      for(let i=0; i<12;i++) {
        taskIds.push(taskcluster.slugid());
        time = new Date();
        await helper.LastFire.create({...entity, taskId: taskIds[i], taskCreateTime: new Date()});
      }
      const count = await helper.LastFire.expires(new Date(), 5);
      assume(count).to.equal(7);

      recentTaskIds = [];
      await helper.LastFire.query({
        hookGroupId: 'testHookGroup',
        hookId: 'testhook'},
      {
        handler: async lastFire => {
          item = await lastFire.definition();
          const { taskId } = item;
          recentTaskIds.push(taskId);
        },
      }
      );
      taskIds.splice(0, 7);
      assume(recentTaskIds.sort()).eql(taskIds.sort());
    });
  });
});
