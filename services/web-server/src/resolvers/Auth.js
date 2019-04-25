export default {
  LoginStrategy: {
    MOZILLA_AUTH0: 'mozilla-auth0',
    GITHUB_OAUTH2: 'github-oauth2',
  },
  Query: {
    getCredentials(parent, { provider, accessToken }, { loaders }) {
      return loaders.getCredentials.load({ provider, accessToken });
    },
  },
};
