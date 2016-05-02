let debug = require('debug')('notify');
let _ = require('lodash');
let assert = require('assert');
let aws = require('aws-sdk-promise');
let marked = require('marked');

/**
 * Object to send notifications, so the logic can be re-used in both the pulse
 * listener and the API implementation.
 */
class Notifier {
  constructor(options = {}) {
    // Set default options
    this.options = _.defaults({}, options, {

    });
    this.ses = new aws.SES(_.defaults({
      params: {
        Source: options.email,
      },
    }, options.aws);
    this.publisher = options.publisher;
    this.sqs = new aws.SQS(options.aws);
    this.queueUrl = this.sqs.createQueue({
      QueueName:  this.options.queueName,
    }).then(req => req.data.QueueUrl);
  }

  email({address, subject, content, replyTo}) {
    let html = marked(content, {
      gfm:          true,
      tables:       true,
      breaks:       true,
      pedantic:     false,
      sanitize:     true,
      smartLists:   true,
      smartypants:  false,
    });
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
      ReplyToAddresses: replyTo ? [replyTo] : [],
    });
  }

  pulse({routingKey, message}) {
    return this.publisher.notify(message, routingKey);
  }

  async irc({channel, user, message}) {
    await this.sqs.sendMessage({
      QueueUrl:       await this.queueUrl,
      MessageBody:    JSON.stringify({channel, user, message}),
      DelaySeconds:   0,
    });
  }
};

// Export notifier
module.exports = Notifier;