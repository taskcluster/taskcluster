class SlackBot {
  constructor({ slackClient, monitor }) {
    this.client = slackClient;
    this.monitor = monitor;
  }

  async sendMessage({ channelId, text, blocks, attachments, unfurlLinks, unfurlMedia }) {
    const response = await this.client.chat.postMessage({
      channel: channelId,
      text,
      blocks,
      attachments,
      unfurl_links: unfurlLinks,
      unfurl_media: unfurlMedia,
    });
    if (!response.ok) {
      throw new Error(`Error posting slack message: ${response.error}`);
    }
  }
}

export default SlackBot;
