module.exports = {
  Query: {
    getCredentials(parent, { accessToken }, { loaders }) {
      return loaders.getCredentials.load(accessToken);
    },
  },
};
