const builder = require('./api');
const jwt = require('jsonwebtoken');

builder.declare({
  method: 'get',
  route: '/websocktunnel/:wstAudience/:wstClient',
  params: {
    wstAudience: /^[a-zA-Z0-9_-]{1,38}$/, // identifier-token format
    wstClient: /^[a-zA-Z0-9_~.%-]+$/, // websocktunnel's clientId format
  },
  name: 'websocktunnelToken',
  output: 'websocktunnel-token-response.yml',
  stability: 'stable',
  category: 'Websocktunnel Credentials',
  scopes: 'auth:websocktunnel-token:<wstAudience>/<wstClient>',
  title: 'Get a client token for the Websocktunnel service',
  description: [
    'Get a temporary token suitable for use connecting to a',
    '[websocktunnel](https://github.com/taskcluster/websocktunnel) server.',
    '',
    'The resulting token will only be accepted by servers with a matching audience',
    'value.  Reaching such a server is the caller\s responsibility.  In general,',
    'a server URL or set of URLs should be provided to the caller as configuration',
    'along with the audience value.',
    '',
    'The token is valid for a limited time (on the scale of hours). Callers should',
    'refresh it before expiration.',
  ].join('\n'),
}, async function(req, res) {
  const {wstAudience, wstClient} = req.params;
  const clientId = await req.clientId();
  const nowTs = Math.floor(Date.now() / 1000);
  const expiresTs = nowTs + 96 * 3600;

  const payload = {
    tid: wstClient,
    aud: wstAudience,
    sub: clientId,
    iat: nowTs,
    exp: expiresTs,
    nbf: nowTs - 900, // allow 15 min of drift
    iss: 'taskcluster-auth',
  };
  const token = jwt.sign(payload, this.websocktunnel.secret);

  return res.reply({
    wstClient,
    wstAudience,
    token,
    expires: new Date(expiresTs * 1000).toJSON(),
  });
});
