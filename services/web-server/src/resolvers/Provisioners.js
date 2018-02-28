export default {
  Query: {
    provisioners(parent, { connection, filter }, { loaders }) {
      return loaders.provisioners.load({ connection, filter });
    },
  },
};
