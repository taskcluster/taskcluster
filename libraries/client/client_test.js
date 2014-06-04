suite('auth', function() {
  var taskcluster = require('./');
  test('inspect', function() {
    var auth = new taskcluster.Auth({
      credentials: {
        clientId:     'zIroSzcvRPezmco_cecVmA',
        accessToken:  'Rj7z_GDMSaKWGadgs-je1Am7z5Q4zuQgOj6AZa0wzSSgAIkKQpB1RTG328W1Ls6WTA'
      }
    });
    // Inspect the credentials
    return auth.inspect('zIroSzcvRPezmco_cecVmA').then(function(client) {
      assert(client.clientId === 'zIroSzcvRPezmco_cecVmA', "Expected clientId");
    });
  });
});