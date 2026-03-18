import taskcluster from '@taskcluster/client';

export const scopeExpression = {
  AllOf: [
    'queue:create-task:highest:built-in/succeed',
    'queue:scheduler-id:smoketest',
  ],
};

export const tasks = [];
tasks.push({
  title: 'Check dependencies',
  requires: [
    'ping-queue',
  ],
  provides: [
    'target-dependencies',
  ],
  run: async (_requirements, utils) => {
    const taskCount = 3;
    const taskIds = [];
    const queue = new taskcluster.Queue(taskcluster.fromEnvVars());
    for (let i = 0; i < taskCount; i++) {
      const task = {
        provisionerId: 'built-in',
        workerType: 'succeed',
        created: (new Date()).toJSON(),
        schedulerId: 'smoketest',
        deadline: taskcluster.fromNowJSON('2 minutes'),
        metadata: {
          name: `Smoketest dependencies task Nr${taskCount - i}`,
          description: 'built-in/succeed task created during dependency smoketest',
          owner: 'smoketest@taskcluster.net',
          source: 'https://taskcluster.net',
        },
        payload: {},
      };
      task.dependencies = [...taskIds];
      taskIds.push(taskcluster.slugid());
      await queue.createTask(taskIds[i], task);
      utils.status({ message: `Created task ${taskIds[i]}` });
    }
    const pollStartTime = new Date();
    while (Date.now()- pollStartTime < 1200000) {
      const statuses = [];
      let message = 'Task execution status:';
      for (let i = 0; i < taskCount; i++) {
        const taskStatus = await queue.status(taskIds[i]);
        message += `\n\t${i}. ${taskIds[i]}:${taskStatus.status.state}`;
        if (i > 0) {
          if (taskStatus.status.state === ('pending' || 'running' || 'completed')) {
            if (taskStatus.status.runs) {
              const scheduledDate = new Date(taskStatus.status.runs[taskStatus.status.runs.length - 1].scheduled);
              const previousTaskCompletion = new Date(
                statuses[i - 1].status.runs[statuses[i - 1].status.runs.length - 1].resolved,
              );
              if (scheduledDate < previousTaskCompletion) {
                throw new Error(`Task ${taskIds[i]} scheduled before completion of task ${taskIds[i - 1]}`);
              }
            }

          }
        }
        statuses.push(taskStatus);
      }
      utils.status({ message: message });
      if (statuses[statuses.length - 1].status.state === 'completed') {
        return {
          "target-dependencies": statuses[statuses.length - 1].status.state,
        };
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Deadline exceeded');
  },
});
