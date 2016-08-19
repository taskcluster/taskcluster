let debug = require('debug')('notify');
let _ = require('lodash');
let assert = require('assert');
let aws = require('aws-sdk');
let marked = require('marked');
let EmailTemplate = require('email-templates').EmailTemplate;
let path = require('path');

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
    }, options.aws));
    this.publisher = options.publisher;
    this.sqs = new aws.SQS(options.aws);
    this.queueUrl = this.sqs.createQueue({
      QueueName:  this.options.queueName,
    }).promise().then(req => req.data.QueueUrl);
  }

  async email({address, subject, content, link, replyTo, template}) {
    // It is very, very important that this uses the sanitize option
    let html = marked(content, {
      gfm:          true,
      tables:       true,
      breaks:       true,
      pedantic:     false,
      sanitize:     true,
      smartLists:   true,
      smartypants:  false,
    });
    if (template) {
      let templ = new EmailTemplate(path.join(__dirname, 'templates', template));
      let mail = await templ.render({address, subject, content: html, link});
      html = mail.html;
      content = mail.text;
      subject = mail.subject;
    }
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
    }).promise();
  }

  pulse({routingKey, message}) {
    return this.publisher.notify({message}, [routingKey]);
  }

  async irc({channel, user, message}) {
    return this.sqs.sendMessage({
      QueueUrl:       await this.queueUrl,
      MessageBody:    JSON.stringify({channel, user, message}),
      DelaySeconds:   0,
    }).promise();
  }
};

// Export notifier
module.exports = Notifier;
