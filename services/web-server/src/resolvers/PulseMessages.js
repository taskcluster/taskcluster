module.exports = {
  Subscription: {
    pulseMessages: {
      subscribe(parent, { subscriptions }, { pulseEngine }) {
        return pulseEngine.messageIterator('pulseMessages', subscriptions);
      },
    },
  },
};
