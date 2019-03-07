let testing = require('taskcluster-lib-testing');
let taskcluster = require('taskcluster-client');
let slugid = require('slugid');
let https = require('https');
let http = require('http');
let api = require('./api');

let makeTask = () => {
  return {
    provisionerId: 'no-provisioner',
    workerType: 'test-worker',
    created: taskcluster.fromNowJSON(),
    deadline: taskcluster.fromNowJSON('1 hour'),
    payload: {},
    metadata: {
      name: 'Load testing task',
      description: 'Task created during load tests',
      owner: 'jonsafj@mozilla.com',
      source: 'https://github.com/taskcluster/taskcluster-queue',
    },
  };
};

/** Launch server */
let launch = async function(cfg) {
  let fmt = (n) => {
    return Math.round(n * 100) / 100;
  };

  const CYCLE_SECONDS = 3 * 60; //10 * 60; // Normally 3

  let success = 0;
  let failed = 0;
  let summary = () => {
    console.log('%s req/s success: %s, failed: %s',
      fmt(success / CYCLE_SECONDS), success, failed);
    success = 0;
    failed = 0;
  };

  let loops = 0;
  let exiting = false;
  let startLoop = () => {
    loops += 1;
    (async () => {
      let agent = new https.Agent({keepAlive: true});
      if (cfg.server.publicUrl.substr(0, 5) !== 'https') {
        agent = new http.Agent({keepAlive: true});
      }
      let tempCreds = taskcluster.createTemporaryCredentials({
        start: taskcluster.fromNow('- 15 min'),
        expiry: taskcluster.fromNow('4 hours'),
        scopes: [
          'queue:create-task:no-provisioner/test-worker',
          'queue:claim-task:no-provisioner/test-worker',
          'queue:claim-work:no-provisioner/test-worker',
          'queue:worker-id:no-worker/dummy-worker',
        ],
        credentials: cfg.taskcluster.credentials,
      });
      let reference = api.reference({
        baseUrl: cfg.server.publicUrl + '/v1',
      });
      let Queue = taskcluster.createClient(reference);
      let queue = new Queue({
        credentials: tempCreds,
        retries: 0,
        baseUrl: cfg.server.publicUrl + '/v1',
        agent: agent,
        authorizedScopes: [
          'queue:create-task:no-provisioner/test-worker',
          'queue:claim-task:no-provisioner/test-worker',
          'queue:claim-work:no-provisioner/test-worker',
          'queue:worker-id:no-worker/dummy-worker',
        ],
      });
      while (true) {
        await (async () => {
          let taskId = slugid.v4();
          await queue.createTask(taskId, makeTask());

          let result = await queue.claimTask(taskId, 0, {
            workerGroup: 'no-worker',
            workerId: 'dummy-worker',
          });//*/
          /*let r = await queue.claimWork('no-provisioner', 'test-worker', {
            workerGroup:  'no-worker',
            workerId:     'dummy-worker',
            tasks: 1,
          });
          let result = r.tasks[0];
          if (!result) {
            failed += 1;
            return;
          }*/
          let q2 = new Queue({
            credentials: result.credentials,
            baseUrl: cfg.server.publicUrl + '/v1',
            retries: 0,
            agent: agent,
          });
          await q2.reportCompleted(result.status.taskId, 0);
        })().then(() => {
          success += 1;
        }, (err) => {
          failed += 1;
          if (exiting) {
            console.log('Error: %s: %s', err.statusCode, err.message);
          }
        });
        if (exiting) {
          break;
        }
        await testing.sleep(10);
      }
    })().catch(function(err) {
      console.log('LOOP CRASHED!!!');
      console.log(err.stack);
    });
  };

  //  2 req in parallel
  /*while (loops < 2) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  //  4 req in parallel
  while (loops < 4) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  //  8 req in parallel
  while (loops < 8) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  */
  // 16 req in parallel
  while (loops < 16) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  /*
  // 32 req in parallel
  while (loops < 32) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();
*/

  // 48 req in parallel
  while (loops < 48) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  //*/
  // 64 req in parallel
  while (loops < 64) { startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  /*

  // 128 req in parallel
  while (loops < 128{ ) startLoop(); }
  await testing.sleep(CYCLE_SECONDS * 1000);
  summary();//*/

  console.log('Exiting');
  exiting = true;
};

// Export launch in-case anybody cares
module.exports = launch;
