const taskcluster = require('taskcluster-client');

exports.tasks = [];
exports.tasks.push({
  title: 'create an indexed task and find it in the index',
  requires: [],
  provides: [
    'target-indexTask',
  ],
  run: async (requirements, utils) => {
    let queue = new taskcluster.Queue(taskcluster.fromEnvVars());
    let randomId = taskcluster.slugid();
    const findIndexedTask='project.taskcluster.smoketest.' + randomId;
    let task = {
      provisionerId: 'built-in',
      workerType: 'succeed',
      created: (new Date()).toJSON(),
      deadline: taskcluster.fromNowJSON('2 minutes'),
      metadata: {
        name: "Smoketest indexTask-find",
        description: "built-in/succeed task created during smoketest",
        owner: "smoketest@taskcluster.net",
        source: "https://taskcluster.net",
      },
      payload: {},
      routes: [`index.project.taskcluster.smoketest.${randomId}`],
    };
    utils.status({message: 'indexTask-find taskId: ' + randomId});
    await queue.createTask(randomId, task);
    let index = new taskcluster.Index(taskcluster.fromEnvVars());
    index.findTask(findIndexedTask);
    let pollForStatusStart = new Date();
    while((new Date() - pollForStatusStart) < 120000){
      let status = await queue.status(randomId);
      if (status.status.state === 'pending' || status.status.state === 'running'){
        utils.status({
          message: 'Current status: ' + status.status.state,
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else if (status.status.state === "completed") {
        return;
      } else {
        throw new Error('Task finished with status ' + status.status.state);
      }
    }
    throw new Error('Deadline exceeded');
  },
});
