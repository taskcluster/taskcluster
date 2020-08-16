const taskcluster = require('taskcluster-client');

exports.scopeExpression = {
  AllOf: [
    'queue:create-task:highest:built-in/succeed',
    'queue:create-task:highest:built-in/fail',
    'queue:scheduler-id:smoketest',
  ],
};

exports.tasks = [];

[
  { taskType: 'succeed', successCondition: 'completed' },
  { taskType: 'fail', successCondition: 'failed' },
].forEach(({ taskType, successCondition })=>{
  exports.tasks.push({
    title: `Create built-in/${taskType} task (--target built-in/${taskType})`,
    requires: [
      'ping-queue',
    ],
    provides: [
      'target-built-in/' + taskType,
    ],
    run: async (requirements, utils) => {
      let task = {
        provisionerId: 'built-in',
        workerType: taskType,
        created: (new Date()).toJSON(),
        deadline: taskcluster.fromNowJSON('2 minutes'),
        schedulerId: 'smoketest',
        metadata: {
          name: 'Smoketest built-in/' + taskType,
          description: 'built-in/' + taskType + ' task created during smoketest',
          owner: 'smoketest@taskcluster.net',
          source: 'https://taskcluster.net',
        },
        payload: {},
      };
      let taskId = taskcluster.slugid();
      utils.status({ message: 'built-in/' + taskType + ' taskId: ' + taskId });
      let queue = new taskcluster.Queue(taskcluster.fromEnvVars());
      await queue.createTask(taskId, task);
      let pollForStatusStart = new Date();
      while((new Date() - pollForStatusStart) < 120000){
        let status = await queue.status(taskId);
        if (status.status.state === 'pending' || status.status.state === 'running'){
          utils.status({
            message: 'Polling built-in/' + taskType + ' task. Current status: ' + status.status.state,
          });
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else if (status.status.state === successCondition) {
          return;
        } else {
          throw new Error('Task finished with status ' + status.status.state);
        }
      }
      throw new Error('Deadline exceeded');
    },
  });
});
