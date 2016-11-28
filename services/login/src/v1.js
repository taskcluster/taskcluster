import API from 'taskcluster-lib-api'
import User from './user'
import _ from 'lodash'

var api = new API({
  title:         "Login API",
  description:   [
    "The Login service serves as the interface between external authentication",
    "systems and TaskCluster credentials.  It acts as the server side of",
    "https://tools.taskcluster.net.  If you are working on federating logins",
    "with TaskCluster, this is probably *not* the service you are looking for.",
    "Instead, use the federated login support in the tools site.",
  ].join('\n'),
  schemaPrefix:  'http://schemas.taskcluster.net/login/v1/',
  context: ['authorizer', 'temporaryCredentials'],
});

// Export api
module.exports = api;

api.declare({
  method: 'get',
  route: '/ping',
  name: 'ping',
  title: 'Ping Server',
  stability:  API.stability.experimental,
  description: [
    'Documented later...',
    '',
    '**Warning** this api end-point is **not stable**.',
  ].join('\n'),
}, function (req, res) {
  res.status(200).json({
    alive: true,
    uptime: process.uptime(),
  });
});

