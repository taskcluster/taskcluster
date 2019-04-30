const assert = require('assert');
const jwt = require('jsonwebtoken');
const jwks = require('jwks-rsa');

module.exports = async ({ token, domain }) => new Promise((resolve, reject) => {
  assert(token, 'No authorization token was found');
  assert(domain, 'A domain is required to verify the jwt');

  const client = jwks({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${domain}/.well-known/jwks.json`,
  });
  const getKey = (header, callback) => {
    client.getSigningKey(header.kid, (err, key) => {
      const signingKey = key.publicKey || key.rsaPublicKey;

      callback(null, signingKey);
    });
  };

  jwt.verify(
    token,
    getKey,
    {
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
    }
  );
});
