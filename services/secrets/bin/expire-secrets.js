#!/usr/bin/env node
import Debug from 'debug';
import base from 'taskcluster-base';
import data from '../lib/data';
import path from 'path';
import common from '../lib/common';
import Promise from 'promise';
import _ from 'lodash';
import assert from 'assert';
import taskcluster from 'taskcluster-client';

let debug = Debug('secrets:expire-secrets');

/** Launch expire-secrets */
let launch = async function(profile) {
  debug("Launching with profile: %s", profile);
  var cfg = common.loadConfig(profile);

  try {
    var statsDrain = common.buildInfluxStatsDrain(
      cfg.get('influx:connectionString'),
      cfg.get('influx:maxDelay'),
      cfg.get('influx:maxPendingPoints')
    );
  } catch(e) {
    debug("Missing influx_connectionStraing: stats collection disabled.");
    var statsDrain = common.stdoutStatsDrain;
  }

  // Start monitoring the process
  base.stats.startProcessUsageReporting({
    drain:      statsDrain,
    component:  cfg.get('taskclusterSecrets:statsComponent'),
    process:    'expire-secrets'
  });

  let entity = data.SecretEntity.setup({
    account:          cfg.get('azure:accountName'),
    credentials:      cfg.get('taskcluster:credentials'),
    table:            cfg.get('azure:tableName'),
    cryptoKey:        cfg.get('azure:cryptoKey'),
    signingKey:       cfg.get('azure:signingKey'),
    drain:            statsDrain,
    component:        cfg.get('taskclusterSecrets:statsComponent'),
    process:          'expire-secrets'
  });

  // Find an secret expiration delay
  var delay = cfg.get('taskclusterSecrets:secretExpirationDelay');
  var now   = taskcluster.fromNow(delay);
  assert(!_.isNaN(now), "Can't have NaN as now");

  debug("Expiring secrets");
  let count = await entity.expire(now);
  debug("Expired " + count + " secrets");

  // Stop recording statistics and send any stats that we have
  return statsDrain.close();
};


// If expire-secrets.js is executed run launch
if (!module.parent) {
  // Find configuration profile
  var profile = process.argv[2];
  if (!profile) {
    console.log("Usage: expire-secrets.js [profile]")
    console.error("ERROR: No configuration profile is provided");
  }
  // Launch with given profile
  launch(profile).then(function() {
    debug("Expired secrets successfully");
    // Close the process we're done now
    process.exit(0);
  }).catch(function(err) {
    debug("Failed to start expire-secrets, err: %s, as JSON: %j",
          err, err, err.stack);
    // If we didn't launch the expire-secrets we should crash
    process.exit(1);
  });
}

// Export launch in-case anybody cares
module.exports = launch;

