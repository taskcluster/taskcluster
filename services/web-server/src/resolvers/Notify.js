export default {
  NotificationType: {
    EMAIL: 'email',
    PULSE: 'pulse',
    MATRIX_ROOM: 'matrix-room',
    SLACK_CHANNEL: 'slack-channel',
  },
  Query: {
    listDenylistAddresses(_parent, { connection, filter }, { loaders }) {
      return loaders.listDenylistAddresses.load({ connection, filter });
    },
  },
  Mutation: {
    async addDenylistAddress(_parent, { address }, { clients }) {
      await clients.notify.addDenylistAddress(address);

      return address;
    },
    async deleteDenylistAddress(_parent, { address }, { clients }) {
      await clients.notify.deleteDenylistAddress(address);

      return address;
    },
  },
};
