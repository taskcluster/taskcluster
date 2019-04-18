export default {
  AuthProvider: {
    MOZILLA_AUTH0: 'mozilla-auth0',
    GITHUB_OAUTH2: 'github-oauth2',
  },
  Query: {
    oidcCredentials(parent, { provider }, { loaders }) {
      return loaders.oidcCredentials.load(provider);
    },
  },
};
