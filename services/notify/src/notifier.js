const debug = require('debug')('notify');
const _ = require('lodash');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const marked = require('marked');
const EmailTemplate = require('email-templates').EmailTemplate;
const RateLimit = require('./ratelimit');

/**
 * Object to send notifications, so the logic can be re-used in both the pulse
 * listener and the API implementation.
 */
class Notifier {
  constructor(options = {}) {
    // Set default options
    this.options = _.defaults({}, options, {
      emailBlacklist: [],
    });
    this.hashCache = [];
    this.ses = options.ses;
    this.publisher = options.publisher;
    this.sqs = options.sqs;
    this.rateLimit = options.rateLimit;
    this.queueName = this.options.queueName;
  }

  async setup() {
    this.queueUrl = (await this.sqs.createQueue({
      QueueName:  this.queueName,
    }).promise()).QueueUrl;
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

  async email({address, subject, content, link, replyTo, template}) {
    if (this.isDuplicate(address, subject, content, link, replyTo)) {
      debug('Duplicate email send detected. Not attempting resend.');
      return;
    }

    // Don't notify emails on the blacklist
    if (this.options.emailBlacklist.includes(address)) {
      debug('Blacklist email: %s send detected, discarding the notification', address);
      return;
    }

    const rateLimit = this.rateLimit.remaining(address);
    if (rateLimit <= 0) {
      debug('Ratelimited email: %s is over its rate limit, discarding the notification', address);
      return;
    }

    debug(`Sending email to ${address}`);
    // It is very, very important that this uses the sanitize option
    let formatted  = marked(content, {
      gfm:          true,
      tables:       true,
      breaks:       true,
      pedantic:     false,
      sanitize:     true,
      smartLists:   true,
      smartypants:  false,
    });

    let tmpl = new EmailTemplate(path.join(__dirname, 'templates', template || 'simple'));
    let mail = await tmpl.render({address, subject, content, formatted, link, rateLimit});
    let html = mail.html;
    content = mail.text;
    subject = mail.subject;
    return this.ses.sendEmail({
      Destination: {
        ToAddresses: [address],
      },
      Message: {
        Subject: {
          Data:       subject,
          Charset:    'UTF-8',
        },
        Body: {
          Html: {
            Data:     html,
            Charset:  'UTF-8',
          },
          Text: {
            Data:     content,
            Charset:  'UTF-8',
          },
        },
      },
    }).promise().then(res => {
      this.rateLimit.markEvent(address);
      this.markSent(address, subject, content, link, replyTo);
      return res;
    });
  }

  async pulse({routingKey, message}) {
    if (this.isDuplicate(routingKey, message)) {
      debug('Duplicate pulse send detected. Not attempting resend.');
      return;
    }
    debug(`Publishing message on ${routingKey}`);
    return this.publisher.notify({message}, [routingKey]).then(res => {
      this.markSent(routingKey, message);
      return res;
    });
  }

  async irc({channel, user, message}) {
    if (channel && !/^[#&][^ ,\u{0007}]{1,199}$/u.test(channel)) {
      debug('irc channel ' + channel + ' invalid format. Not attempting to send.');
      return;
    }
    if (this.isDuplicate(channel, user, message)) {
      debug('Duplicate irc message send detected. Not attempting resend.');
      return;
    }
    debug(`sending irc message to ${user || channel}.`);
    return this.sqs.sendMessage({
      QueueUrl:       this.queueUrl,
      MessageBody:    JSON.stringify({channel, user, message}),
      DelaySeconds:   0,
    }).promise().then(res => {
      this.markSent(channel, user, message);
      return res;
    });
  }
}

// Export notifier
module.exports = Notifier;
