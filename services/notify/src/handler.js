let debug = require('debug')('notify');
let _ = require('lodash');
let assert = require('assert');
let taskcluster = require('taskcluster-client');
let jsone = require('json-e');

/** Handler listening for tasks that carries notifications */
class Handler {
  constructor({notifier, validator, monitor, routePrefix, listener, queue, testing}) {
    this.queue = queue;

    this.notifier = notifier;
    this.validator = validator;
    this.monitor = monitor;
    this.routePrefix = routePrefix;

    this.listener = listener;
    this.testing = testing;

    // Bind to exchanges with pattern for custom routing keys
    let qe = new taskcluster.QueueEvents();
    this.listener.bind(qe.taskCompleted(`route.${routePrefix}.#.on-completed.#`));
    this.listener.bind(qe.taskCompleted(`route.${routePrefix}.#.on-any.#`));
    this.listener.bind(qe.taskFailed(`route.${routePrefix}.#.on-failed.#`));
    this.listener.bind(qe.taskFailed(`route.${routePrefix}.#.on-any.#`));
    this.listener.bind(qe.taskException(`route.${routePrefix}.#.on-exception.#`));
    this.listener.bind(qe.taskException(`route.${routePrefix}.#.on-any.#`));

    // Handle messages
    this.listener.on('message', this.monitor.timedHandler('notification', this.onMessage.bind(this)));
  }

  async listen() {
    if (!this.testing) {
      await this.listener.connect();
    }
    await this.listener.resume();
  }

  renderMessage(template, context) {
    try {
      return jsone(template, context);
    } catch (err) {
      // We will try to deliver nice error messages for json-e errors
      if (err.name && _.includes(['BuiltinError', 'TemplateError', 'InterpreterError', 'SyntaxError'], err.name)) {
        return `Error parsing custom message: ${err.message}`;
      }
      throw err;
    }
  }

  async onMessage(message) {
    let {status} = message.payload;

    // If task was canceled, we don't send a notification since this was a deliberate user action
    if (status.state === 'exception' && (_.last(status.runs) || {}).reasonResolved === 'canceled') {
      debug('Received message for %s with notify routes, ignoring because task was canceled', status.taskId);
      return null;
    }

    // Load task definition
    let taskId = status.taskId;
    let task = await this.queue.task(taskId);
    let href = `https://tools.taskcluster.net/task-inspector/#${taskId}`;
    let groupHref = `https://tools.taskcluster.net/task-group-inspector/#/${task.taskGroupId}`;
    let runCount = status.runs.length;

    debug(`Received message for ${taskId} with notify routes. Finding notifications.`);
    this.monitor.count('notification-requested.any');

    return Promise.all(message.routes.map(entry => {
      let route = entry.split('.');

      // convert from on- syntax to state. e.g. on-exception -> exception
      let decider = _.join(_.slice(route[route.length -1], 3), '');
      if (decider !== 'any' && status.state !== decider) {
        return;
      }

      let ircMessage = `Task "${task.metadata.name}" complete with status '${status.state}'. Inspect: ${href}`;

      switch (route[1]) {
        case 'irc-user':
          this.monitor.count('notification-requested.irc-user');
          if (_.has(task, 'extra.notify.ircUserMessage')) {
            ircMessage = this.renderMessage(task.extra.notify.ircUserMessage, {task, status});
          }
          return this.notifier.irc({
            user: route[2],
            message: ircMessage,
          });

        case 'irc-channel':
          this.monitor.count('notification-requested.irc-channel');
          if (_.has(task, 'extra.notify.ircChannelMessage')) {
            ircMessage = this.renderMessage(task.extra.notify.ircChannelMessage, {task, status});
          }
          return this.notifier.irc({
            channel: route[2],
            message: ircMessage,
          });

        case 'pulse':
          this.monitor.count('notification-requested.pulse');
          return this.notifier.pulse({
            routingKey: _.join(_.slice(route, 2, route.length - 1), '.'),
            message: status,
          });

        case 'email':
          this.monitor.count('notification-requested.email');
          let content = `
Task [\`${taskId}\`](${href}) in task-group [\`${task.taskGroupId}\`](${groupHref}) is complete.

**Status:** ${status.state} (in ${runCount} run${runCount === 1? '' : 's'})
**Name:** ${task.metadata.name}
**Description:** ${task.metadata.description}
**Owner:** ${task.metadata.owner}
**Source:** ${task.metadata.source}
          `;
          let link = {text: 'Inspect Task', href};
          let subject = `Task ${status.state}: ${task.metadata.name} - ${taskId}`;
          let template = 'simple';
          if (_.has(task, 'extra.notify.email')) {
            let extra = task.extra.notify.email;
            content = extra.content ? this.renderMessage(extra.content, {task, status}) : content;
            subject = extra.subject ? this.renderMessage(extra.subject, {task, status}) : subject;
            link = extra.link ? jsone(extra.link, {task, status}) : link;
            template = extra.template ? jsone(extra.template, {task, status}) : template;
          }
          return this.notifier.email({
            address:  _.join(_.slice(route, 2, route.length - 1), '.'),
            content,
            subject,
            link,
            template,
          });

        default:
      }
    }));
  }
};

// Export Handler
module.exports = Handler;
