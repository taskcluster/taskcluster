let debug = require('debug')('notify');
let _ = require('lodash');
let assert = require('assert');
let taskcluster = require('taskcluster-client');

/** Handler listening for tasks that carries notifications */
class Handler {
  /** Construct listener given notifier, pulse credentials and queueName */
  constructor(notifier, validator, credentials, queueName) {
    // Create queue
    this.queue = new taskcluster.Queue();

    // Store notifier and validator
    this.notifier = notifier;
    this.validator = validator;

    // Create listener
    this.listener = new taskcluster.PulseListener({credentials, queueName});

    // Bind to exchanges with pattern for custom routing keys
    let qe = new taskcluster.QueueEvents();
    this.listener.bind(qe.taskCompleted('route.notify.#.on-completed.#'));
    this.listener.bind(qe.taskFailed('route.notify.#.on-failed.#'));
    this.listener.bind(qe.taskException('route.notify.#.on-exception.#'));

    // Handle messages
    this.listener.on('message', m => this.onMessage(m));
  }

  async listen() {
    await this.listener.connect();
    await this.listener.resume();
  }

  async onMessage(message) {
    // Load task definition
    let task = await this.queue.task(message.payload.status.taskId);

    // Skip the message if extra data isn't present on invalid
    if (!(task.extra.notify instanceof Array)) {
      return;
    }

    // Find entries for email, pulse and irc messages
    const PREFIX = 'http://schemas.taskcluster.net/notify/v1/';
    let emailMessages = task.extra.notify.filter(entry => {
      let errors = this.validator.check(entry, PREFIX + 'email-request.json');
      return !errors;
    });
    let pulseMessages = task.extra.notify.filter(entry => {
      let errors = this.validator.check(entry, PREFIX + 'pulse-request.json');
      return !errors;
    });
    let ircMessages = task.extra.notify.filter(entry => {
      let errors = this.validator.check(entry, PREFIX + 'irc-request.json');
      return !errors;
    });

    // Send all messages in parallel
    return Promise.all(_.flatten([
      emailMessages.map(m => this.notifier.email(m)),
      pulseMessages.map(m => this.notifier.pulse(m)),
      ircMessages.map(m => this.notifier.irc(m)),
    ]));
  }
};

// Export Handler
module.exports = Handler;

