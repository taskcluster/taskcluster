const taskcluster = require('taskcluster-client');

exports.tasks = [];
exports.tasks.push({
  title: 'Built-in/succeed task check',
  requires: [],
  provides: [
    'built-in/succeed',
  ],
  run: async (requirements, utils) => {
    let task = {
      provisionerId: 'built-in',
      workerType: 'succeed',
      created: (new Date()).toJSON(),
      deadline: taskcluster.fromNowJSON('2 minutes'),
      metadata: {
        name: "Smoketest built-in/succeed",
        description: "built-in/succeed task created during smoketest",
        owner: "smoketest@taskcluster.net",
        source: "https://taskcluster.net",
      },
      payload: {},
    };
    let taskId = taskcluster.slugid();
    let queue = new taskcluster.Queue({
      rootUrl: process.env.TASKCLUSTER_ROOT_URL,
      credentials: {
        clientId: process.env.TASKCLUSTER_CLIENT_ID,
        accessToken: process.env.TASKCLUSTER_ACCESS_TOKEN,
      },
    });
    let result = await queue.createTask(taskId, task);
    while (1){
      let status = await queue.status(taskId);
      if (status.state === 'pending'){
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        return {
          ['built-in/succeed']: result.state,
        };

      }
    }
    return result;
  },
});
