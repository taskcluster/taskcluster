export default {
  Subscription: {
    pulseMessages: {
      subscribe(_parent, { subscriptions }, { pulseEngine }) {
        return pulseEngine.messageIterator('pulseMessages', subscriptions);
      },
    },
  },
};
