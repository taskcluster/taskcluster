let API         = require('taskcluster-lib-api');
let Validate    = require('taskcluster-lib-validate');
let App         = require('taskcluster-lib-app');
let taskcluster = require('taskcluster-client');

// Create a simple test server that we can set test requests to, useful for
// testing that validation works as expected.

const PORT = 60321;

let myapi = new API({
  title:        'Test API Server',
  description:  'API server for testing',
  name:         'authtest',
});

myapi.declare({
  method:       'get',
  route:        '/resource',
  name:         'resource',
  scopes:       {AllOf: ['myapi:resource']},
  title:        'Get Resource',
  description:  '...',
}, function(req, res) {
  res.status(200).json({
    message: 'Hello World',
  });
});

module.exports = async ({authBaseUrl, rootAccessToken}) => {
  // Create application
  let serverApp = App({
    port:           PORT,
    env:            'development',
    forceSSL:       false,
    trustProxy:     false,
    rootDocsLink:   false,
  });

  // Create router for the API
  let router = myapi.router({
    authBaseUrl,
    validator: await Validate({
      prefix: 'auth/v1',
    }),
  });

  // Mount router
  serverApp.use('/v1', router);

  // Create server
  let server = await serverApp.createServer();
  let baseUrl = 'http://localhost:' + server.address().port + '/v1';

  let reference = myapi.reference({baseUrl});
  let MyClient = taskcluster.createClient(reference);
  let myClient = new MyClient({
    baseUrl,
    credentials: {
      clientId: 'static/taskcluster/root',
      accessToken: rootAccessToken,
    },
  });

  return {
    server,
    reference,
    baseUrl,
    Client: MyClient,
    client: myClient,
  };
};
