import debugFactory from 'debug';
const debug = debugFactory('notify');
import _ from 'lodash';
import path from 'path';
import crypto from 'crypto';
import sanitizeHtml from 'sanitize-html';
import { marked } from 'marked';
import Email from 'email-templates';
import nodemailer from 'nodemailer';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';

const __dirname = new URL('.', import.meta.url).pathname;

/**
 * Object to send notifications, so the logic can be re-used in both the pulse
 * listener and the API implementation.
 */
class Notifier {
  constructor(options = {}) {
    this.options = options;
    this.hashCache = [];
    this.publisher = options.publisher;
    this.rateLimit = options.rateLimit;
    this.queueName = this.options.queueName;
    this.sender = options.sourceEmail;
    this._matrix = options.matrix;
    this._slack = options.slack;
    this.monitor = options.monitor;

    const transport = nodemailer.createTransport({
      SES: { sesClient: options.ses, SendEmailCommand },
    });
    this.emailer = new Email({
      transport,
      send: true,
      preview: false,
      views: { root: path.join(__dirname, 'templates') },
      juice: true,
      juiceResources: {
        webResources: {
          relativeTo: path.join(__dirname, 'templates'),
        },
      },
    });
  }

  key(idents) {
    return crypto
      .createHash('md5')
      .update(JSON.stringify(idents))
      .digest('hex');
  }

  isDuplicate(...idents) {
    return _.indexOf(this.hashCache, this.key(idents)) !== -1;
  }

  markSent(...idents) {
    this.hashCache.unshift(this.key(idents));
    this.hashCache = _.take(this.hashCache, 1000);
  }

  async email({ address, subject, content, link, replyTo, template }) {
    if (this.isDuplicate(address, subject, content, link, replyTo)) {
      debug('Duplicate email send detected. Not attempting resend.');
      return false;
    }

    if (await this.options.denier.isDenied('email', address)) {
      debug('Denylist email: denylisted send detected, discarding the notification');
      return false;
    }

    const rateLimit = this.rateLimit.remaining(address);
    if (rateLimit <= 0) {
      debug('Ratelimited email: %s is over its rate limit, discarding the notification', address);
      return false;
    }

    debug(`Sending email to ${address}`);
    // It is very, very important that this uses the sanitize option
    let formatted = marked(content, {
      gfm: true,
      tables: true,
      breaks: true,
      pedantic: false,
      smartLists: true,
      smartypants: false,
    });
    formatted = sanitizeHtml(formatted);

    const res = await this.emailer.send({
      message: {
        from: this.sender,
        to: address,
      },
      template: template || 'simple',
      locals: { address, subject, content, formatted, link, rateLimit },
    });
    this.rateLimit.markEvent(address);
    this.markSent(address, subject, content, link, replyTo);
    this.monitor.log.email({ address });
    return res;
  }

  async pulse({ routingKey, message }) {
    if (this.isDuplicate(routingKey, message)) {
      debug('Duplicate pulse send detected. Not attempting resend.');
      return false;
    }

    if (await this.options.denier.isDenied('pulse', routingKey)) {
      debug('Denylist pulse: denylisted send detected, discarding the notification');
      return false;
    }

    debug(`Publishing message on ${routingKey}`);
    await this.publisher.notify({ message }, [routingKey]);
    this.markSent(routingKey, message);
    this.monitor.log.pulse({ routingKey });
    // publisher doesn't return anything so we need to return successful here
    return true;
  }

  async matrix({ roomId, format, formattedBody, body, notice, msgtype }) {
    if (this.isDuplicate(roomId, format, formattedBody, body, msgtype)) {
      debug('Duplicate matrix send detected. Not attempting resend.');
      return false;
    }

    if (await this.options.denier.isDenied('matrix-room', roomId)) {
      debug('Denylist matrix: denylisted send detected, discarding the notification');
      return false;
    }

    await this._matrix.sendMessage({ roomId, format, formattedBody, body, notice, msgtype });
    this.markSent(roomId, format, formattedBody, body, msgtype);
    this.monitor.log.matrix({ dest: roomId });
    return true;
  }

  async slack({ channelId, text, blocks, attachments }) {
    if (!this._slack) {
      this.monitor.warning(`Slack message sent to ${channelId} but Slack is not configured.`);
      return false;
    }

    if (this.isDuplicate('slack-channel', channelId, text, blocks, attachments)) {
      debug('Duplicate slack message detected. Not attempting resend.');
      return false;
    }

    if (await this.options.denier.isDenied('slack-channel', channelId, text)) {
      debug('Denylist slack: denylisted send detected, discarding the notification');
      return false;
    }

    await this._slack.sendMessage({ channelId, text, blocks, attachments });
    this.markSent('slack-channel', channelId, text, blocks, attachments);
    this.monitor.log.slack({ channelId });
    return true;
  }
}

// Export notifier
export default Notifier;
