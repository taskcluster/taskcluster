export default {
  Subscription: {
    pulseMessages: {
      subscribe(parent, { exchange, pattern }, { clients }) {
        return clients.pulseSubscription.asyncIterator({
          exchange,
          pattern,
        });
      },
    },
  },
};
