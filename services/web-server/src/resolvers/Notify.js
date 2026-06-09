export default {
  NotificationType: {
    EMAIL: 'email',
    PULSE: 'pulse',
    MATRIX_ROOM: 'matrix-room',
    SLACK_CHANNEL: 'slack-channel',
  },
  Query: {
    listDenylistAddresses(parent, { connection, searchTerm }, { loaders }) {
      return loaders.listDenylistAddresses.load({ connection, searchTerm });
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
