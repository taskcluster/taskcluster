const taskcluster = require('taskcluster-client');

exports.tasks = [];
exports.tasks.push({
  title: 'Built-in/succeed task check',
  requires: [],
  provides: [
    'built-in/succeed',
  ],
  run: async () => {
    let task = {
      provisionerId: 'built-in',
      workerType: 'succeed',
      created: (new Date()).toJSON(),
      deadline: (new Date()).toJSON(),
      payload: {},
      metadata: {
        name: 'Smoketest built-in/succeed',
        description: 'A task for built-in/succeed worker type',
        owner: 'none@taskcluster.com',
        source: 'https://tools.taskcluster.net/tasks/create',
      },
    };
    async ()=> {
      let taskId = taskcluster.slugid();
      let queue = new taskcluster.Queue();
      let result = await queue.createTask(taskId, task);
      return result;
    };
  },
});
