export default class PulseSubscription {
  constructor({ listener, emitter }) {
    this.listener = listener;
    this.emitter = emitter;
  }

  async asyncIterator(pattern, eventName) {
    const channel = pattern.routingKeyPattern;

    this.listener.bind(pattern);
    this.listener.on('message', message => {
      this.emitter.publish(
        channel,
        eventName ? { [eventName]: message.payload } : message
      );
    });
    await this.listener.resume();

    return emitter.asyncIterator(channel);
  }
}
