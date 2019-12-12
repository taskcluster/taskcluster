const {consume} = require('taskcluster-lib-pulse');
const irc = require('irc-upd');
const taskcluster = require('taskcluster-client');
const assert = require('assert');

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
    assert(options.monitor, 'options.monitor is required');
    assert(options.reference, 'options.reference is required');
    assert(options.rootUrl, 'options.rootUrl is required');
    assert(options.pulseQueueName, 'options.pulseQueueName is required');
    this.monitor = options.monitor;
    this.client = new irc.Client(options.server, options.nick, {
      userName: options.userName,
      realName: options.realName,
      password: options.password,
      port: options.port,
      autoConnect: false,
      secure: true,
      debug: options.debug || false,
      showErrors: false,
    });
    this.client.on('error', rpt => {
      if (rpt.command !== 'err_nosuchnick') {
        this.monitor.reportError(new Error('irc_error'), rpt);
      }
    });
    this.client.on('unhandled', msg => {
      // ignore some common messages
      if (msg.command === 'rpl_whoismodes' || msg.command === 'rpl_whoissecure') {
        return;
      }
      this.monitor.notice({message: 'Unhandled message from IRC server', content: msg});
    });
    this.pulseClient = options.pulseClient;
    this.reference = options.reference;
    this.rootUrl = options.rootUrl;
    this.pulseQueueName = options.pulseQueueName;
  }

  async start() {
    this.monitor.notice("Connecting to IRC server");
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
    this.monitor.notice("Connected to IRC server");

    const NotifyEvents = taskcluster.createClient(this.reference);
    const notifyEvents = new NotifyEvents({rootUrl: this.rootUrl});

    this.pq = await consume({
      client: this.pulseClient,
      bindings: [notifyEvents.ircRequest()],
      queueName: this.pulseQueueName,
    },
    this.monitor.timedHandler('notification', this.onMessage.bind(this)),
    );
  }

  async onMessage({payload}) {
    let {channel, user, message} = payload;
    if (channel && !/^[#&][^ ,\u{0007}]{1,199}$/u.test(channel)) {
      this.monitor.info('irc channel ' + channel + ' invalid format. Not attempting to send.');
      return;
    }
    this.monitor.info(`Sending message to ${user || channel}: ${message}.`);
    if (channel) {
      // This callback does not ever have an error. If it triggers, we have succeeded
      // Time this out after 10 seconds to avoid blocking forever
      await new Promise((accept, reject) => {
        setTimeout(() => {
          this.monitor.info('Timed out joining channel, may be ok. Proceeding.');
          accept();
        }, 10000);
        this.client.join(channel, accept);
      });
    }
    // Post message to user or channel (which ever is given)
    this.client.say(user || channel, message);
  }

  async terminate() {
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
