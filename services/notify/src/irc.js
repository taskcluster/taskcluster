let debug = require('debug')('notify');
let Promise = require('bluebird');
let irc = Promise.promisifyAll(require('irc'));
let assert = require('assert');
let aws = require('aws-sdk');
let _  = require('lodash');

const MAX_RETRIES = 5;

/** IRC bot for delivering notifications */
class IRCBot {
  /**
   * Create IRC bot
   *
   * optipns:
   * ```js
   * {
   *   server:   'irc.mozilla.org',
   *   nick:     '',
   *   userName: '',
   *   realName: '',
   *   password: '',
   *   aws:      {...},
   * }
   * ```
   */
  constructor(options) {
    assert(options,           'options is required');
    assert(options.server,    'options.server is required');
    assert(options.port,      'options.port is required');
    assert(options.nick,      'options.nick is required');
    assert(options.userName,  'options.userName is required');
    assert(options.realName,  'options.realName is required');
    assert(options.password,  'options.password is required');
    assert(options.aws,       'options.aws is required');
    assert(options.queueName, 'options.queueName is required');
    this.client = new irc.Client(options.server, options.nick, {
      userName: options.userName,
      realName: options.realName,
      password: options.password,
      port: options.port,
      autoConnect: false,
      secure: true,
      debug: true,
    });
    this.client.addListener('error', message => {
      // We add this listener because this library
      // emits an error for any message it receives
      // and we don't really care about anything
      // we receive.
    });
    this.sqs = new aws.SQS(options.aws);
    this.queueName = options.queueName;
    this.stopping = false;
    this.done = Promise.resolve(null);
  }

  async start() {
    await this.client.connectAsync().catch((e) => {
      // We always get an error when connecting to irc.mozilla.org
      if (e.command !== 'rpl_welcome') {
        throw e;
      };
    });

    let queueUrl = await this.sqs.createQueue({
      QueueName:  this.queueName,
    }).promise().then(req => req.data.QueueUrl);

    this.done = (async () => {
      debug('Connecting to: ' + queueUrl);
      while (!this.stopping) {
        debug('Waiting for message from sqs.');
        let req = await this.sqs.receiveMessage({
          QueueUrl:             queueUrl,
          AttributeNames:       ['ApproximateReceiveCount'],
          MaxNumberOfMessages:  10,
          VisibilityTimeout:    30,
          WaitTimeSeconds:      20,
        }).promise();
        if (!req.data.Messages) {
          debug('Did not receive any messages from sqs in timout.');
          continue;
        }
        debug(`Received ${req.data.Messages.length} messages from sqs.`);
        let success = 0;
        for (let message of req.data.Messages) {
          try {
            await this.notify(JSON.parse(message.Body));
          } catch (err) {
            console.log('Failed to send IRC notification: %j, %s',
                        err, err.stack);
            // Skip deleting if we're below MAX_RETRIES
            if (message.Attributes.ApproximateReceiveCount < MAX_RETRIES) {
              continue;
            }
          }
          // Delete message
          await this.sqs.deleteMessage({
            QueueUrl:       queueUrl,
            ReceiptHandle:  message.ReceiptHandle,
          }).promise();
          success += 1;
        }
        debug(`Deleted ${success} message from sqs.`);
      }
    })();
  }

  async notify({channel, user, message}) {
    debug(`Sending message to ${user || channel}: ${message}.`);
    // If a channel is specified we need to join it, we just do this every time
    // as it probably doesn't do any harm...
    if (channel) {
      // This callback does not ever have an error. If it triggers, we have succeeded
      await new Promise((accept, reject) => this.client.join(channel, accept));
    }
    // Post message to user or channel (which ever is given)
    this.client.say(user || channel, message);
  }

  async terminate() {
    this.stopping = true;
    await this.done;
    await this.client.disconnectAsync();
  }

};

module.exports = IRCBot;
