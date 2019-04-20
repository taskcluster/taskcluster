const debug = require('debug')('notify');
const irc = require('irc-upd');
const assert = require('assert');
const aws = require('aws-sdk');

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
    assert(options, 'options is required');
    assert(options.server, 'options.server is required');
    assert(options.port, 'options.port is required');
    assert(options.nick, 'options.nick is required');
    assert(options.userName, 'options.userName is required');
    assert(options.realName, 'options.realName is required');
    assert(options.password, 'options.password is required');
    assert(options.aws, 'options.aws is required');
    assert(options.queueName, 'options.queueName is required');
    assert(options.monitor, 'options.monitor is required');
    this.monitor = options.monitor;
    this.client = new irc.Client(options.server, options.nick, {
      userName: options.userName,
      realName: options.realName,
      password: options.password,
      port: options.port,
      autoConnect: false,
      secure: true,
      debug: options.debug || false,
      showErrors: true,
    });
    this.client.on('error', rpt => {
      if (rpt.command !== 'err_nosuchnick') {
        this.monitor.reportError(new Error('irc_error'), rpt);
      }
    });
    this.client.on('unhandled', msg => {
      this.monitor.notice(msg);
    });
    this.pulseClient = options.pulseClient;
    this.stopping = false;
    this.done = Promise.resolve(null);
  }

  async start() {
    await new Promise((resolve, reject) => {
      try {
        this.client.connect(resolve);
      } catch (err) {
        if (err.command !== 'rpl_welcome') {
          reject(err);
        }
        resolve();
      }
    });

    this.pq = await consume({
      client: this.pulseClient,
      bindings: [{exchange:'irc-notification', routingKeyPattern: 'irc'}],
      queueName: 'irc-notifications',
    },
    this.monitor.timedHandler('notification', this.onMessage.bind(this))
    );
  }

  async onMessage({payload}) {
    let {channel, user, message} = payload.message;
    if (channel && !/^[#&][^ ,\u{0007}]{1,199}$/u.test(channel)) {
      debug('irc channel ' + channel + ' invalid format. Not attempting to send.');
      return;
    }
    debug(`Sending message to ${user || channel}: ${message}.`);
    if (channel) {
      // This callback does not ever have an error. If it triggers, we have succeeded
      // Time this out after 10 seconds to avoid blocking forever
      await new Promise((accept, reject) => {
        setTimeout(() => {
          debug('Timed out joining channel, may be ok. Proceeding.');
          accept();
        }, 10000);
        this.client.join(channel, accept);
      });
    }
    // Post message to user or channel (which ever is given)
    this.client.say(user || channel, message);
  }

  async terminate() {
    this.stopping = true;
    await this.done;
    await new Promise((resolve, reject) => {
      try {
        this.client.disconnect(resolve);
      } catch (err) {
        reject(err);
      }
    });
  }

}

module.exports = IRCBot;
