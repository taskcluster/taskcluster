import assert from 'node:assert';
import taskcluster from '@taskcluster/client';
import gql from 'graphql-tag';
import testing from '@taskcluster/lib-testing';
import helper from '../helper.js';

helper.secrets.mockSuite(testing.suiteName(), [], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withClients(skipping);
  helper.withServer(skipping);
  helper.withPulse(helper, skipping);
  helper.resetTables();

  suite('Task Queries and Mutations', () => {
    test('query works', async () => {
      const client = helper.getHttpClient();
      const taskId = taskcluster.slugid();
      const createTaskQuery = await helper.loadFixture('createTask.graphql');
      const taskQuery = await helper.loadFixture('task.graphql');

      // 1. create task
      await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: helper.makeTaskDefinition(),
        },
      });

      // 2. get task
      const response = await client.query({
        query: gql`${taskQuery}`,
        variables: {
          taskId,
        },
      });

      assert.equal(response.data.task.taskId, taskId);
    });

    test('mutation works', async () => {
      const client = helper.getHttpClient();
      const taskId = taskcluster.slugid();
      const createTaskQuery = await helper.loadFixture('createTask.graphql');

      const response = await client.mutate({
        mutation: gql`${createTaskQuery}`,
        variables: {
          taskId,
          task: helper.makeTaskDefinition(),
        },
      });

      assert.equal(response.data.createTask.taskId, taskId);
    });
  });
});
