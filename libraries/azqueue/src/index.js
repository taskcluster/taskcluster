const assert = require('assert').strict;
const taskcluster = require('taskcluster-client');

class AZQueue {
  constructor({ db }) {
    this.db = db;
  }

  // NOOP
  async createQueue(name, metadata) {

  }

  async getMetadata(name) {
    const result = await this.db.fns.azure_queue_count(name);

    return {
     messageCount: result[0].azure_queue_count,
    }
  }

  async setMetadata(name, update) {

  }

  async putMessage(name, text, {visibilityTimeout, messageTTL}) {
    const result = await this.db.fns.azure_queue_put(
      name,
      text,
      taskcluster.fromNow(`${visibilityTimeout} seconds`),
      taskcluster.fromNow(`${messageTTL} seconds`)
    );
  }

  async getMessage(name, {visibilityTimeout, numberOfMessages}) {

  }

  async deleteMessage(name, messageId, popReceipt) {

  }

  async updateMessage(name, messageText, messageId, popRecipt, {visibilityTimeout}) {

  }

  async listQueues() {

  }

  // NOOP
  async deleteQueue(name) {

  }
}

module.exports = AZQueue;