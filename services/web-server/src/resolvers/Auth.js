module.exports = {
  LoginStrategy: {
    MOZILLA_AUTH0: 'mozilla-auth0',
    GITHUB: 'github',
  },
  Query: {
    getCredentials(parent, { provider, accessToken }, { loaders }) {
      return loaders.getCredentials.load({ provider, accessToken });
    },
  },
};
