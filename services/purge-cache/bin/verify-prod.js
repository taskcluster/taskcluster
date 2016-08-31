'use strict';
let config = require('typed-env-config');
let taskcluster = require('taskcluster-client');

let cfg = config({profile: 'verify'});

let purgeCache = new taskcluster.PurgeCache({
  credentials: cfg.taskcluster.credentials
});

purgeCache.purgeCache(
 'verifyprovisioner',
 'verifyworker',
 {cacheName: 'verifycache'}
);
