export default {
  Query: {
    listDenylistAddresses(parent, { connection, filter }, { loaders }) {
      return loaders.notify.load({ connection, filter });
    },
  },
  Mutation: {
    async addDenylistAddress(parent, { address }, { clients }) {
      await clients.notify.addDenylistAddress(address);

      return address;
    },
    async deleteDenylistAddress(parent, { address }, { clients }) {
      await clients.notify.deleteDenylistAddress(address);

      return address;
    },
  },
};
