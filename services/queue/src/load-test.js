var debug         = require('debug')('app:load-test');
var base          = require('taskcluster-base');
var path          = require('path');
var Promise       = require('promise');
var _             = require('lodash');
var taskcluster   = require('taskcluster-client');
var slugid        = require('slugid');
var https         = require('https');
var http          = require('http');

var makeTask = () => {
  return {
    provisionerId:    'no-provisioner',
    workerType:       'test-worker',
    created:          taskcluster.fromNowJSON(),
    deadline:         taskcluster.fromNowJSON('1 hour'),
    payload:          {},
    metadata: {
      name:           "Load testing task",
      description:    "Task created during load tests",
      owner:          'jonsafj@mozilla.com',
      source:         'https://github.com/taskcluster/taskcluster-queue'
    }
  };
};

/** Launch server */
var launch = async function(cfg) {
  var fmt = (n) => {
    return Math.round(n * 100) / 100;
  };

  const CYCLE_SECONDS = 10 * 60; // Normally 3

  var success = 0;
  var failed  = 0;
  var summary = () => {
    console.log("%s req/s success: %s, failed: %s",
                fmt(success / CYCLE_SECONDS), success, failed)
    success = 0;
    failed  = 0;
  };

  var loops = 0;
  var exiting = false;
  var startLoop = () => {
    loops += 1;
    (async() => {
      var agent = new https.Agent({keepAlive: true});
      if (cfg.server.publicUrl.substr(0, 5) != 'https') {
        agent = new http.Agent({keepAlive: true});
      }
      var tempCreds = taskcluster.createTemporaryCredentials({
        start:        taskcluster.fromNow('- 15 min'),
        expiry:       taskcluster.fromNow('4 hours'),
        scopes: [
          'queue:*',
          'index:*',
          'assume:*',
          'scheduler:*',
          'auth:azure-table-access:taskclusterdev/*',
          'docker-worker:cache:*',
          'docker-worker:image:taskcluster/*',
          'docker-worker:capability:device:loopbackVideo',
          'docker-worker:capability:device:loopbackAudio'
        ],
        credentials:  cfg.taskcluster.credentials
      });
      var queue = new taskcluster.Queue({
        credentials:      tempCreds,
        retries:          0,
        baseUrl:          cfg.server.publicUrl + '/v1',
        agent:            agent,
        authorizedScopes: [
          'queue:create-task:no-provisioner/test-worker',
          'index:-random-scope.that-is-a-non-trivial.string',
          'assume:*',
          'scheduler:-random-scope.that-is-a-non-trivial.string',
          'auth:azure-table-access:taskclusterdev/*',
          'docker-worker:cache:*',
          'docker-worker:image:taskcluster/*',
          'docker-worker:capability:device:loopbackVideo',
          'docker-worker:capability:device:loopbackAudio'
        ]
      });
      while(true) {
        await queue.createTask(slugid.v4(), makeTask()).then(() => {
          success += 1;
        }, (err) => {
          failed += 1;
          if (exiting) {
            console.log("Error: %s: %s", err.statusCode, err.message);
          }
        });
        if (exiting) {
          break;
        }
        await base.testing.sleep(10);
      }
    })().catch(function(err) {
      console.log("LOOP CRASHED!!!");
      console.log(err.stack);
    });
  };

  //  2 req in parallel
  while(loops < 2) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  //  4 req in parallel
  while(loops < 4) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  //  8 req in parallel
  while(loops < 8) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  // 16 req in parallel
  while(loops < 16) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  // 32 req in parallel
  while(loops < 32) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  // 48 req in parallel
  while(loops < 48) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  //*/
/*
  // 64 req in parallel
  while(loops < 64) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  // 128 req in parallel
  while(loops < 128) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();//*/

  console.log("Exiting");
  exiting = true;
};

// Export launch in-case anybody cares
module.exports = launch;





