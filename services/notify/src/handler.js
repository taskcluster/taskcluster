let debug = require('debug')('notify');
let _ = require('lodash');
let assert = require('assert');
let taskcluster = require('taskcluster-client');

/** Handler listening for tasks that carries notifications */
class Handler {
  /** Construct listener given notifier, pulse credentials and queueName */
  constructor({notifier, validator, credentials, queueName, monitor}) {
    this.queue = new taskcluster.Queue();

    this.notifier = notifier;
    this.validator = validator;
    this.monitor = monitor;

    // Create listener
    this.listener = new taskcluster.PulseListener({credentials, queueName});

    // Bind to exchanges with pattern for custom routing keys
    let qe = new taskcluster.QueueEvents();
    this.listener.bind(qe.taskCompleted('route.notify.#.on-completed.#'));
    this.listener.bind(qe.taskCompleted('route.notify.#.on-any.#'));
    this.listener.bind(qe.taskFailed('route.notify.#.on-failed.#'));
    this.listener.bind(qe.taskFailed('route.notify.#.on-any.#'));
    this.listener.bind(qe.taskException('route.notify.#.on-exception.#'));
    this.listener.bind(qe.taskException('route.notify.#.on-any.#'));

    // Handle messages
    this.listener.on('message', m => this.onMessage(m));
  }

  async listen() {
    await this.listener.connect();
    await this.listener.resume();
  }

  async onMessage(message) {
    // Load task definition
    let taskId = message.payload.status.taskId;
    let task = await this.queue.task(taskId);
    let status = await this.queue.status(taskId);
    let href = `https://tools.taskcluster.net/task-inspector/#${taskId}`;
    let groupHref = `https://tools.taskcluster.net/task-group-inspector/#${task.taskGroupId}`;
    let runCount = status.status.runs.length;

    // Skip the message if extra data isn't present on invalid
    if (!(task.extra.notify instanceof Array)) {
      return;
    }

    debug(`Recieved message for ${taskId} with task.extra.notify attributes. Finding notifications.`);

    // Find entries for email, pulse and irc messages
    const PREFIX = 'http://schemas.taskcluster.net/notify/v1/';
    let emailMessages = task.extra.notify.filter(entry => {
      return _.has(entry, 'address');
    });
    let pulseMessages = task.extra.notify.filter(entry => {
      return _.has(entry, 'routingKey');
    });
    let ircMessages = task.extra.notify.filter(entry => {
      return _.has(entry, 'channel') || _.has(entry, 'user');
    });

    // Send all messages in parallel
    return Promise.all(_.flatten([
      pulseMessages.map(m => this.notifier.pulse(m)),
      ircMessages.map(m => {
        m.message = `Task "${task.metadata.name}" complete with status '${status.status.state}'. Inspect: ${href}`;
        return this.notifier.irc(m);
      }),
      emailMessages.map(m => {
        // I hate having to dedent this, but it's easy and without it there's
        // whitespace before every line, making Markdown think it's preformatted.
        m.content = `
Task [\`${taskId}\`](${href}) in task-group [\`${task.taskGroupId}\`](${groupHref}) is complete.

**Status:** ${status.status.state} (in ${runCount} run${runCount === 1? '' : 's'})
**Name:** ${task.metadata.name}
**Description:** ${task.metadata.description}
**Owner:** ${task.metadata.owner}
**Source:** ${task.metadata.source}
        `;
        m.subject = `Task complete: ${task.metadata.name} - ${taskId}`;
        m.link = {text: 'Inspect Task', href};
        return this.notifier.email(m);
      }),
    ]));
  }
};

// Export Handler
module.exports = Handler;

