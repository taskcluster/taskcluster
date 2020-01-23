const taskcluster = require('taskcluster-client');

class AZQueue {
  constructor({ db }) {
    this.db = db;
  }

  async createQueue(name, metadata) {
    // NOOP
  }

  async getMetadata(name) {
    const result = await this.db.fns.azure_queue_count(name);

    return {
      messageCount: result[0].azure_queue_count,
    };
  }

  async setMetadata(name, update) {

  }

  async putMessage(name, text, {visibilityTimeout, messageTTL}) {
    await this.db.fns.azure_queue_put(
      name,
      text,
      taskcluster.fromNow(`${visibilityTimeout} seconds`),
      taskcluster.fromNow(`${messageTTL} seconds`),
    );
  }

  async getMessages(name, {visibilityTimeout, numberOfMessages}) {

  }

  async deleteMessage(name, messageId, popReceipt) {

  }

  async updateMessage(name, messageText, messageId, popRecipt, {visibilityTimeout}) {

  }

  async listQueues() {
    // stubbed out
    return {queues: []};
  }

  async deleteQueue(name) {
    // NOOP
  }
}

module.exports = AZQueue;
