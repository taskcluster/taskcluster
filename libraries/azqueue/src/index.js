const taskcluster = require('taskcluster-client');

class AZQueue {
  constructor({ db }) {
    this.db = db;
  }

  async createQueue(name, metadata) {
    // NOOP
  }

  async getMetadata(name) {
    const [{ azure_queue_count }] = await this.db.fns.azure_queue_count(name);

    return {
      messageCount: azure_queue_count,
    };
  }

  async setMetadata(name, update) {
    // NOOP
  }

  async putMessage(name, text, { visibilityTimeout, messageTTL, taskQueueId, priority, payload }) {
    await this.db.fns.azure_queue_put_extra(
      name,
      text,
      taskcluster.fromNow(`${visibilityTimeout} seconds`),
      taskcluster.fromNow(`${messageTTL} seconds`),
      taskQueueId,
      priority,
      payload,
    );
  }

  async getMessages(name, { visibilityTimeout, numberOfMessages }) {
    const res = await this.db.fns.azure_queue_get(
      name,
      taskcluster.fromNow(`${visibilityTimeout} seconds`),
      numberOfMessages);
    return res.map(({ message_id, message_text, pop_receipt }) => ({
      messageId: message_id,
      messageText: message_text,
      popReceipt: pop_receipt,
    }));
  }

  async deleteMessage(name, messageId, popReceipt) {
    await this.db.fns.azure_queue_delete(name, messageId, popReceipt);
  }

  async updateMessage(name, messageText, messageId, popReceipt, { visibilityTimeout, payload }) {
    await this.db.fns.azure_queue_update_extra(
      name,
      messageText,
      messageId,
      popReceipt,
      taskcluster.fromNow(`${visibilityTimeout} seconds`),
      payload);
  }

  async listQueues() {
    // stubbed out
    return { queues: [] };
  }

  async deleteQueue(name) {
    // NOOP
  }

  async deleteExpiredMessages() {
    await this.db.fns.azure_queue_delete_expired();
  }
}

module.exports = AZQueue;
