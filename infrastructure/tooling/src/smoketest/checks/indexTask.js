import taskcluster from '@taskcluster/client';

export const scopeExpression = {
  AllOf: [
    'queue:create-task:highest:built-in/succeed',
    'queue:scheduler-id:smoketest',
  ],
};

export const tasks = [];
tasks.push({
  title: 'Create an indexed task and find it in the index (--target index)',
  requires: [
    'ping-queue',
    'ping-index',
  ],
  provides: [
    'target-index',
  ],
  run: async (requirements, utils) => {
    const queue = new taskcluster.Queue(taskcluster.fromEnvVars());
    const randomId = taskcluster.slugid();
    const taskIndex = 'project.taskcluster.smoketest.' + randomId;
    const task = {
      provisionerId: 'built-in',
      workerType: 'succeed',
      created: (new Date()).toJSON(),
      schedulerId: 'smoketest',
      deadline: taskcluster.fromNowJSON('2 minutes'),
      expires: taskcluster.fromNowJSON('60 minutes'),
      metadata: {
        name: "Smoketest indexTask-find",
        description: "built-in/succeed task created during smoketest",
        owner: "smoketest@taskcluster.net",
        source: "https://taskcluster.net",
      },
      payload: {},
      routes: [`index.${taskIndex}`],
    };
    utils.status({ message: 'indexTask-find taskId: ' + randomId });
    await queue.createTask(randomId, task);
    const index = new taskcluster.Index(taskcluster.fromEnvVars());
    const pollForStatusStart = new Date();
    while ((new Date() - pollForStatusStart) < 120000) {
      const status = await queue.status(randomId);
      if (status.status.state === 'pending' || status.status.state === 'running') {
        utils.status({
          message: 'Current task status: ' + status.status.state,
        });
      } else if (status.status.state === 'completed') {
        try {
          await index.findTask(taskIndex);
          return;
        }
        catch (err) {
          utils.status({
            message: 'waiting for the task to be indexed',
          });
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Deadline exceeded');
  },
});
