const Entity = require('azure-entities');

module.exports = Entity.configure({
  version: 1,
  partitionKey: Entity.keys.ConstantKey('githubAccessTokens'),
  rowKey: Entity.keys.StringKey('userId'),
  signEntities: true,
  properties: {
    // A unique user ID assigned to the user
    userId: Entity.types.String,
    // The Github Oauth access token
    accessToken: Entity.types.EncryptedText,
  },
});
