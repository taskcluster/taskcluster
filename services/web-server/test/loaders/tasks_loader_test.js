import assert from 'assert';
import taskcluster from '@taskcluster/client';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';
import loader from '../../src/loaders/tasks.js';

helper.secrets.mockSuite(testing.suiteName(), [], function(mock, skipping) {
  helper.withDb(mock, skipping);
  helper.withClients(mock, skipping);
  helper.withServer(mock, skipping);
  helper.resetTables(mock, skipping);

  suite('tasks loaders', function() {
    // Make sure we still get tasks even if we end up loading some tasks that don't exist
    test('load multiple tasks while gracefully handling errors', async function() {
      const client = helper.getHttpClient();
      const taskId = taskcluster.slugid();

      const createTaskQuery = await helper.loadFixture('createTask.graphql');

      // 1. create task
      await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: helper.makeTaskDefinition(),
        },
      });

      const taskLoader = loader({ queue: helper.clients().queue, index: helper.clients.index }).task;

      // 2. get tasks
      const [firstTask, taskThatDoesNotExist] = await Promise.allSettled([
        taskLoader.load(taskId),
        taskLoader.load('taskId-that-does-not-exist'),
      ]);

      assert.equal(firstTask.status, 'fulfilled');
      assert.equal(firstTask.value.taskId, taskId);
      assert.equal(taskThatDoesNotExist.status, 'rejected');
      assert(taskThatDoesNotExist.reason instanceof Error);
    });
  });
});
