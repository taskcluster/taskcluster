export default {
  Subscription: {
    pulseMessages: {
      subscribe(parent, { subscriptions }, { pulseEngine }) {
        return pulseEngine.asyncIterator('pulseMessages', subscriptions);
      },
    },
  },
};
