var debug         = require('debug')('queue:bin:load-test');
var base          = require('taskcluster-base');
var Promise       = require('promise');
var _             = require('lodash');
var v1            = require('../auth/v1');
var https         = require('https');
var http          = require('http');
var hawk          = require('hawk');
var taskcluster   = require('taskcluster-client');
var assert        = require('assert');

// run with:
// heroku run -s performance-m --app tc-auth-load-test babel-node bin/load-test.js load-test

/** Launch server */
var launch = async function(profile) {
  debug("Launching with profile: %s", profile);

  // Load configuration
  var cfg = base.config({profile: 'load-test'});

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
      scopes: [
        'auth:credentials',
        'assume:worker-type:aws-provisioner/dockerhost-g2',
        'assume:worker-id:*',
        'client-id:-69R5nFgQhmFalR2J3y9pA',
        'client-id:-ojkeT4cQ8iPqzfjX6YqPw',
        'client-id:-yX0fVeLQWWwZ8wS0DHz9Q',
        'client-id:00F-p0pNSaSklX6COjCTHg',
        'client-id:09tML-c8Tf6pYehxK8Rrpw',
        'client-id:0BI2Jg_ZSuCHg6bEyPdD9A',
        'client-id:DqpvW5MaS7*',
        'client-id:JmhqKvaWTHmnxmRqoORBaA',
        'client-id:KHa1Y5wARRGL8R6GAsgW3w',
        'client-id:LY8eSq1WTb6qKMrWKGTvqw',
        'client-id:LvL_9Z2FQLa2gO-3AgCQ_A',
        'client-id:LvhIONB6TAKCeZsbmrImrA',
        'client-id:MC7GCZfURkCGO8rS9KxgTg',
        'client-id:N6l8rTzKRdCsLxXpboKNuw',
        'client-id:NJ3G1h8ARkGhekYPFYhmVw',
        'client-id:O6yB_zofTjCAjPSu4iYKoA',
        'client-id:OXSb5WUVQk6STvKkCPitgw',
        'client-id:Po0gCUk-Rx-OzBV_bcOkhQ',
        'client-id:QUUeaAazTAmU6F3Sc29zvQ',
        'client-id:SUkfDCeyStmQbgu4f4yXCg',
        'client-id:SbTaWGCUSnG65E4dqLpxDQ',
        'client-id:T9J-xA9JSUKQzfR99NRtMg',
        'client-id:WX5WaEuzTwGh0Q-zpGSoWg',
        'client-id:XJhrEh8MSG-34W5qQjRadQ',
        'client-id:XsQX5VRnSCi_gG1Fbby0AQ',
        'client-id:_9TuTPNUSQKMW8wcMIsrxA',
        'client-id:_XwhECl7T_WBWcOdRQFVkA',
        'client-id:_rUyXCLtT0SSDw37PXFIFw',
        'client-id:a8298TjkQf2*'
      ],
      credentials: {
        clientId: 'root',
        accessToken: cfg.app.rootAccessToken,
      }
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
      if (cfg.server.publicUrl.substr(0, 5) != 'https') {
        agent = new http.Agent({keepAlive: true});
      }
      var Auth = taskcluster.createClient(v1.reference({
        baseUrl:      cfg.server.publicUrl + '/v1',
      }));
      var auth = new Auth({
        retries:      0,
        agent:        agent
      });
      var reqForVerification = makeSignature();
      setInterval(function() {
        reqForVerification = makeSignature();
      }, 3 * 60 * 1000);
      while(true) {
        await auth.authenticateHawk(reqForVerification).then(result => {
          assert(result.status === 'auth-success', "Validation error");
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





