const jwksClient = require('jwks-rsa');

const cache = {};
// Construct this once, not for every call -- it rate-limits itself and caches the value between calls
module.exports = ({ domain }) => {
  const client = cache[domain]
    ? cache[domain]
    : jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${domain}/.well-known/jwks.json`,
    });

  cache[domain] = client;

  return client;
};
