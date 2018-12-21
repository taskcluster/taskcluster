
let config = require('typed-env-config');
let taskcluster = require('taskcluster-client');

let cfg = config({profile: 'verify'});

let purgeCache = new taskcluster.PurgeCache({
  ...cfg.taskcluster,
});

purgeCache.purgeCache(
  'verifyprovisioner',
  'verifyworker',
  {cacheName: 'verifycache'}
).catch(function(err) {console.log(err);});
