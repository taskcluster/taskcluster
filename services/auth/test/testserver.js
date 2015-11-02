let base        = require('taskcluster-base');
let taskcluster = require('taskcluster-client');

// Create a simple test server that we can set test requests to, useful for
// testing that validation works as expected.

const PORT = 60321;

let myapi = new base.API({
  title:        "Test API Server",
  description:  "API server for testing"
});

myapi.declare({
  method:       'get',
  route:        '/resource',
  name:         'resource',
  scopes:       [['myapi:resource']],
  title:        "Get Resource",
  description:  "..."
}, function(req, res) {
  res.status(200).json({
    message: "Hello World"
  });
});

module.exports = async ({authBaseUrl, rootAccessToken}) => {
  // Create application
  let app = base.app({
    port:           PORT,
    env:            'development',
    forceSSL:       false,
    trustProxy:     false,
  });

  // Create router for the API
  let router = myapi.router({
    authBaseUrl,
    validator: await base.validator(),
  });

  // Mount router
  app.use('/v1', router);

  // Create server
  let server = await app.createServer();
  let baseUrl = 'http://localhost:' + server.address().port + '/v1';

  let reference = myapi.reference({baseUrl});
  let MyClient = taskcluster.createClient(reference);
  let myClient = new MyClient({
    baseUrl,
    credentials: {
      clientId: 'root',
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
