import assert from 'node:assert';
import taskcluster from '@taskcluster/client';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';
import loader from '../../src/loaders/tasks.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withClients(skipping);
  helper.withServer(skipping);
  helper.resetTables();

  suite('tasks loaders', () => {
    // Make sure we still get tasks even if we end up loading some tasks that don't exist
    test('load multiple tasks while gracefully handling errors', async () => {
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

    // An error artifact used to arrive as HTTP 424 from the download endpoint, the typed artifact
    // endpoint replies 200 with storageType 'error' instead, which the client raises as
    // `ArtifactError`. A `reference` artifact is refused rather than fetched, since its URL is
    // chosen by the decision task. Neither is a failure — there are simply no actions to report.
    test('taskActions reports no actions when actions.json is unusable', async () => {
      const taskActionsFor = async artifact =>
        await loader({ queue: { latestArtifact: async () => artifact }, index: {} }).taskActions.load({
          taskGroupId: taskcluster.slugid(),
          contextScope: 'task',
        });

      assert.equal(await taskActionsFor({ storageType: 'error', message: 'gone', reason: 'file-missing' }), null);
      assert.equal(await taskActionsFor({ storageType: 'reference', url: 'http://169.254.169.254/metadata' }), null);
    });
  });
});
