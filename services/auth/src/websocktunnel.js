const builder = require('./v1');
const slugid = require('slugid');
const jwt = require('jsonwebtoken');
const taskcluster = require('taskcluster-client');

builder.declare({
  method:     'get',
  route:      '/websocktunnel',
  name:       'websocktunnelToken',
  input:      undefined,
  output:     'websocktunnel-token-response.yml',
  stability:  'stable',
  scopes:     'auth:websocktunnel',
  title:      'Get Token for Websocktunnel Proxy',
  description: [
    'Get temporary `token` and `id` for connecting to websocktunnel',
    'The token is valid for 96 hours, clients should refresh after expiration.',
  ].join('\n'),
}, async function(req, res) {
  let tunnelId = (slugid.nice()+slugid.nice()).toLowerCase();
  let secret = this.websocktunnel.secret;
  let proxyUrl = this.websocktunnel.proxyUrl;
  let clientId = await req.clientId();
  let now = Math.floor(Date.now()/1000);

  let payload = {
    tid: tunnelId,
    sub: clientId,
    iat: now,
    exp: now+96*60*60,
    nbf: now - 900, // maybe 15 min of drift
    iss: 'taskcluster-auth',
    aud: 'websocktunnel',
  };
  let token = jwt.sign(payload, secret);

  return res.reply({tunnelId, token, proxyUrl});
});
