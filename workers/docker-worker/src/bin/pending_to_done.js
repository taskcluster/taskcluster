#! /usr/bin/env node --harmony

var taskcluster = require('taskcluster-client');
var queue = new taskcluster.Queue();
var got = require('got');

var PENDING = 'https://queue.taskcluster.net/v1/pending-tasks/aws-provisioner';
var workerType = process.argv[2];


async function main () {
  const res = await got(PENDING);
  var pending = JSON.parse(res.body).tasks;

  for (var i = 0; i < pending.length; i++) {
    var taskId = pending[i].taskId;
    var runId = Math.max(pending[i].runs.length - 1, 0);
    var workerType = pending[i].workerType;

    if (workerType !== workerType) continue;

    console.log('begin claiming', taskId, runId);
    try {
      await queue.claimTask(taskId, runId, {
        workerGroup: 'skip',
        workerId: 'skip'
      });

      await queue.reportCompleted(taskId, runId, { success: false });
    } catch (e) {
      console.error('Could not complete %s %d', taskId, runId, e, JSON.stringify(e.body, null, 2));
    }
  }
}

main().catch((err) => {
  // Top level uncaught fatal errors!
  console.error(err);
  throw err; // nothing to do so show a message and crash
});
