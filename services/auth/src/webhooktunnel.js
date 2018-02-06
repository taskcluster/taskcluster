let api = require('./v1');
let slugid = require('slugid');
let jwt = require('jsonwebtoken');
let taskcluster = require('taskcluster-client');

api.declare({
  method:     'get',
  route:      '/webhooktunnel',
  name:       'webhooktunnelToken',
  input:      undefined,
  output:     'webhooktunnel-token-response.json#',
  stability:  'stable',
  scopes:     'auth:webhooktunnel',
  title:      'Get Token for Webhooktunnel Proxy',
  description: [
    'Get temporary `token` and `id` for connecting to webhooktunnel',
    'The token is valid for 96 hours, clients should refresh after expiration.',
  ].join('\n'),
}, async function(req, res) {
  let tunnelId = (slugid.nice()+slugid.nice()).toLowerCase();
  let secret = this.webhooktunnel.secret;
  let proxyUrl = this.webhooktunnel.proxyUrl;
  let clientId = await req.clientId();
  let now = Math.floor(Date.now()/1000);

  let payload = {
    tid: tunnelId,
    sub: clientId,
    iat: now,
    exp: now+96*60*60,
    nbf: now - 900, // maybe 15 min of drift
    iss: 'taskcluster-auth',
    aud: 'webhooktunnel',
  };
  let token = jwt.sign(payload, secret);

  return res.reply({tunnelId, token, proxyUrl});
});
