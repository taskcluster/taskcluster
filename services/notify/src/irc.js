let irc = require('irc');
let Promise = require('promise');
let assert = require('assert');

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
  contructor (options) {
    assert(options,           'options is required');
    assert(options.server,    'options.server is required');
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
      secure:   true,
      sasl:     true,  // try port 6669 if this doesn't work...
    });
    this.sqs = new aws.SQS(options.aws);
    this.queueName = options.queueName;
    this.stopping = false;
    this.done = Promise.resolve(null);
  }

  async start () {
    // Connect to IRC
    await new Promise((accept, reject) => this.client.connect(err => {
      err ? reject(err) : accept();
    }));

    let queueUrl = await this.sqs.createQueue({
      QueueName:  this.queueName,
    }).then(req => req.data.QueueUrl);

    this.done = (async () => {
      while (!this.stopping) {
        let req = await this.sqs.receiveMessage({
          QueueUrl:             queueUrl,
          AttributeNames:       ['ApproximateReceiveCount'],
          MaxNumberOfMessages:  10,
          VisibilityTimeout:    30,
          WaitTimeSeconds:      300,
        });
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
            ReceiptHandle:  ReceiptHandle,
          });
        }
      }
    })();
  }

  async notify ({channel, user, message}) {
    // If a channel is specified we need to join it, we just do this every time
    // as it probably doesn't do any harm...
    if (channel) {
      await Promise((accept, reject) => this.client.join(channel, err => {
        err ? reject(err) : accept();
      }));
    }
    // Post message to user or channel (which ever is given)
    let target = user || channel;
    await Promise((accept, reject) => this.client.say(target, message, err => {
      err ? reject(err) : accept();
    }));
  }

  async terminate () {
    this.stopping = true;
    await this.done;
    await new Promise(accept => this.client.disconnect(accept));
  }

};

