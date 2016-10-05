let taskcluster = require('taskcluster-client');
let _ = require('lodash');

let secrets = new taskcluster.Secrets({
  baseUrl: 'taskcluster/secrets/v1',
});

secrets.get('repo:github.com/taskcluster/taskcluster-github').then((vars) => {
  _.each(_.toPairs(vars.secret), ([key, value]) => {console.log(`export ${key}=${value}`);});
}).catch(console.error);

