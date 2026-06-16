export default {
  Query: {
    getCredentials(_parent, args, { loaders }) {
      return loaders.getCredentials.load(args);
    },
    isLoggedIn(_parent, args, { loaders }) {
      return loaders.isLoggedIn.load(args);
    },
  },
};
