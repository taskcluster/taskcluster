module.exports = {
  Query: {
    getCredentials(parent, args, { loaders }) {
      return loaders.getCredentials.load(args);
    },
  },
};
