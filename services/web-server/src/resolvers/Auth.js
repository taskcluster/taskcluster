module.exports = {
  Query: {
    getCredentials(parent, { taskclusterToken }, { loaders }) {
      return loaders.getCredentials.load(taskclusterToken);
    },
  },
};
