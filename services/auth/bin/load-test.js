var debug         = require('debug')('queue:bin:load-test');
var base          = require('taskcluster-base');
var Promise       = require('promise');
var _             = require('lodash');
var v1            = require('../routes/api/v1');
var https         = require('https');
var http          = require('http');
var hawk          = require('hawk');
var taskcluster   = require('taskcluster-client');
var assert        = require('assert');

/** Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({
    defaults:     require('../config/defaults'),
    profile:      require('../config/' + profile),
    envs: [
      'server_publicUrl',
      'server_cookieSecret',
      'azure_accountName',
      'azure_accountKey',
      'aws_accessKeyId',
      'aws_secretAccessKey',
      'influx_connectionString',
      'auth_root_clientId',
      'auth_root_accessToken',
      'auth_azureAccounts',
      'auth_clientIdForTempCreds'
    ],
    filename:     'taskcluster-auth'
  });

  var fmt = (n) => {
    return Math.round(n * 100) / 100;
  };

  const CYCLE_SECONDS = 3 * 60;

  var success = 0;
  var failed  = 0;
  var summary = () => {
    console.log("SUMMARY: %s req/s success: %s, failed: %s",
                fmt(success / CYCLE_SECONDS), success, failed)
    success = 0;
    failed  = 0;
  };

  /*
  setInterval(function() {
    console.log(" - %s req/s success: %s, failed: %s",
                fmt(success / CYCLE_SECONDS), success, failed)
  }, 10 * 60 * 1000);// */

  var makeSignature = function() {
    var tempCreds = taskcluster.createTemporaryCredentials({
      start: new Date(),
      expiry: taskcluster.fromNow("1 hour"),
      scopes: ["auth:credentials"],
      credentials: cfg.get('auth:root')
    });
    var reqUrl = 'http://localhost:1207/v1/client/authed-client/credentials';
    var header = hawk.client.header(reqUrl, 'GET', {
      credentials: {
        id:         tempCreds.clientId,
        key:        tempCreds.accessToken,
        algorithm:  'sha256',
      },
      ext: new Buffer(JSON.stringify({
        certificate: JSON.parse(tempCreds.certificate)
      })).toString('base64')
    }).field;
    return {
      method:         'get',
      resource:       '/v1/client/authed-client/credentials',
      host:           'localhost',
      port:           1207,
      authorization:  header
    };
  };

  var loops = 0;
  var exiting = false;
  var startLoop = () => {
    loops += 1;
    (async() => {
      var agent = new https.Agent({keepAlive: true});
      if (cfg.get('server:publicUrl').substr(0, 5) != 'https') {
        agent = new http.Agent({keepAlive: true});
      }
      var Auth = taskcluster.createClient(v1.reference({
        baseUrl:      cfg.get('server:publicUrl') + '/v1',
      }));
      var auth = new Auth({
        //credentials:  cfg.get('auth:root'), //TODO: Try without this!!!
        retries:      0,
        agent:        agent
      });
      var reqForVerification = makeSignature();
      setInterval(function() {
        reqForVerification = makeSignature();
      }, 3 * 60 * 1000);
      while(true) {
        await auth.authenticateHawk(reqForVerification).then(result => {
          assert(result.error === false, "Validation error");
          success += 1;
        }).catch(err => {
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


  /*
  //  2 req in parallel
  while(loops < 2) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();


  //  4 req in parallel
  while(loops < 4) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  // */
  //  8 req in parallel
  while(loops < 8) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  /*
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
  //

  // 64 req in parallel
  while(loops < 64) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();

  // 128 req in parallel
  while(loops < 128) startLoop();
  await base.testing.sleep(CYCLE_SECONDS * 1000);
  summary();
  //*/
  console.log("Exiting");
  exiting = true;
};

// If load-test.js is executed start the load-test
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: load-test.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Launched load-test successfully");
  }).catch(function(err) {
    debug("Failed to start load-test, err: %s, as JSON: %j", err, err, err.stack);
    // If we didn't launch the load-test we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;





