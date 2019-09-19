const assert = require('assert');
const Entity = require('azure-entities');

const GithubAccessToken = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('githubAccessTokens'),
  rowKey: Entity.keys.StringKey('userId'),
  signEntities: true,
  properties: {
    // A unique user ID assigned to the user
    userId: Entity.types.String,
    // The Github Oauth access token
    accessToken: Entity.types.EncryptedText,
    // The expiration time of the table entry
    expires: Entity.types.Date,
  },
});

/**
 * Expire GithubAccessToken entries.
 *
 * Returns a promise that all expired GithubAccessToken entries have been deleted
 */
GithubAccessToken.expire = async function(now) {
  assert(now instanceof Date, 'now must be given as option');
  let count = 0;

  await Entity.scan.call(this, {
    expires: Entity.op.lessThan(now),
  }, {
    limit: 250, // max number of concurrent delete operations
    handler: entry => { count++; return entry.remove(true); },
  });

  return count;
};

module.exports = GithubAccessToken;
