export default {
  Query: {
    getCredentials(parent, args, { loaders }) {
      return loaders.getCredentials.load(args);
    },
    isLoggedIn(parent, args, { loaders }) {
      return loaders.isLoggedIn.load(args);
    },
  },
};
