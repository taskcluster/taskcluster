export default {
  Subscription: {
    pulseMessages: {
      subscribe(parent, { subscriptions }, { pulseEngine }) {
        const triggers = subscriptions.reduce(
          (triggers, { exchange, pattern }) => ({
            ...triggers,
            [pattern]: exchange,
          }),
          {}
        );

        return pulseEngine.asyncIterator('pulseMessages', triggers);
      },
    },
  },
};
