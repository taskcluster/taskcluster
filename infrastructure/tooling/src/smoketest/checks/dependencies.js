const taskcluster = require('taskcluster-client');

exports.scopeExpression = {
  AllOf: [
    'queue:create-task:highest:built-in/succeed',
    'queue:scheduler-id:-',
  ],
};

exports.tasks = [];
exports.tasks.push({
  title: 'Check dependencies',
  requires: [
    'ping-queue',
  ],
  provides: [
    'target-dependencies',
  ],
  run: async (requirements, utils) => {
    let taskCount = 3;
    let taskIds = [];
    let queue = new taskcluster.Queue(taskcluster.fromEnvVars());
    for (let i = 0; i < taskCount; i++){
      let task = {
        provisionerId: 'built-in',
        workerType: 'succeed',
        created: (new Date()).toJSON(),
        deadline: taskcluster.fromNowJSON('2 minutes'),
        metadata: {
          name: 'Smoketest dependencies task Nr' + (taskCount - i),
          description: 'built-in/succeed task created during dependency smoketest',
          owner: 'smoketest@taskcluster.net',
          source: 'https://taskcluster.net',
        },
        payload: {},
      };
      task.dependencies = [...taskIds];
      taskIds.push(taskcluster.slugid());
      await queue.createTask(taskIds[i], task);
      utils.status({message: 'Created task ' + taskIds[i]});
    }
    let pollStartTime = new Date();
    while(new Date() - pollStartTime < 1200000){
      let statuses = [];
      let message = 'Task execution status:';
      for (let i = 0; i < taskCount; i++){
        let taskStatus = await queue.status(taskIds[i]);
        message += '\n\t' + i + '. ' + taskIds[i] + ':' + taskStatus.status.state;
        if (i > 0) {
          if (taskStatus.status.state === ('pending' || 'running' || 'completed')){
            if (taskStatus.status.runs){
              let scheduledDate = new Date(taskStatus.status.runs[taskStatus.status.runs.length - 1].scheduled);
              let previousTaskCompletion = new Date(
                statuses[i - 1].status.runs[statuses[i - 1].status.runs.length - 1].resolved,
              );
              if (scheduledDate < previousTaskCompletion){
                throw new Error('Task ' + taskIds[i] + ' scheduled before completion of task ' + taskIds[i - 1]);
              }
            }

          }
        }
        statuses.push(taskStatus);
      }
      utils.status({message: message});
      if (statuses[statuses.length - 1].status.state === 'completed') {
        return {
          ['target-dependencies']: statuses[statuses.length - 1].status.state,
        };
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Deadline exceeded');
  },
});
