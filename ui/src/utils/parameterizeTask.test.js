import parameterizeTask from './parameterizeTask';

it('should enhance task', () => {
  const task = {
    taskGroupId: 'taskGroupId',
    routes: [],
    dependencies: [],
    requires: [],
    scopes: ['scope1', 'scope2:subscope3', 'docker-worker:cache:*'],
    payload: {
      maxRunTime: 60 * 60 * 3,
      features: {
        interactive: true,
      },
      env: {
        TASKCLUSTER_INTERACTIVE: 'true',
      },
    },
  };
  const enhancedTask = parameterizeTask(task);

  expect(enhancedTask).toHaveProperty('retries', 0);
  expect(enhancedTask).toHaveProperty('deadline');
  expect(
    new Date().getTime() - new Date(enhancedTask.deadline).getTime()
  ).toBeLessThan(12 * 60 * 60 * 1000);
  expect(
    new Date().getTime() - new Date(enhancedTask.created).getTime()
  ).toBeLessThan(1000);
  expect(enhancedTask).toHaveProperty('scopes', ['scope1', 'scope2:subscope3']);
  expect(enhancedTask).toHaveProperty('payload');
  expect(enhancedTask.payload).toEqual({
    maxRunTime: 10800,
    env: { TASKCLUSTER_INTERACTIVE: 'true' },
    features: { interactive: true },
  });
});
