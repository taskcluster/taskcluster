const assert = require('assert');
const jwt = require('jsonwebtoken');
const jwksClient = require('./jwksClient');

module.exports = async ({ token, domain, audience }) => new Promise((resolve, reject) => {
  assert(token, 'No authorization token was found');
  assert(domain, 'A domain is required to verify the jwt');
  assert(audience, `An audience is required to verify the jwt`);

  const client = jwksClient({ domain });
  const getKey = (header, callback) => {
    client.getSigningKey(header.kid) .then(
      key => callback(null, key.publicKey || key.rsaPublicKey),
      err => callback(err));
  };

  jwt.verify(
    token,
    getKey,
    {
      // expect to see our audience in the JWT
      audience,
      // and expect a token issued by auth0
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
    },
    function(err, decoded) {
      if (err) {
        reject(err);
      } else {
        resolve(decoded);
      }
    },
  );
});
