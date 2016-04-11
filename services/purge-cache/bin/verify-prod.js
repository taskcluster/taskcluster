var base = require('taskcluster-base');
var taskcluster = require('taskcluster-client');

var cfg = base.config({profile: 'verify'});

var purgeCache = new taskcluster.PurgeCache({
  credentials: cfg.taskcluster.credentials
});

purgeCache.purgeCache(
 'verifyprovisioner',
 'verifyworker',
 {cacheName: 'verifycache'}
);
