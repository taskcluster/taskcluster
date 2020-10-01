class SlackBot {
  constructor({ slackClient, monitor }) {
    this.client = slackClient;
    this.monitor = monitor;
  }

  async sendMessage({ channelId, text, blocks, attachments }) {
    const response = await this.client.chat.postMessage({
      channel: channelId,
      text,
      blocks,
      attachments,
    });
    if (!response.ok) {
      throw new Error(`Error posting slack message: ${response.error}`);
    }
  }
}

module.exports = SlackBot;
