import _ from 'lodash';
import jsone from 'json-e';
import { consume } from '@taskcluster/lib-pulse';
import libUrls from 'taskcluster-lib-urls';
import utils from './utils.js';

/** Handler listening for tasks that carries notifications */
class Handler {
  constructor(options) {
    const {
      rootUrl,
      notifier,
      monitor,
      routePrefix,
      ignoreTaskReasonResolved,
      pulseClient,
      queue,
      queueEvents,
    } = options;

    this.rootUrl = rootUrl;
    this.queue = queue;
    this.notifier = notifier;
    this.monitor = monitor;
    this.routePrefix = routePrefix;
    this.ignoreTaskReasonResolved = ignoreTaskReasonResolved;

    this.pulseClient = pulseClient;
    this.bindings = [
      queueEvents.taskDefined(`route.${routePrefix}.#.on-defined.#`),
      queueEvents.taskDefined(`route.${routePrefix}.#.on-transition.#`),
      queueEvents.taskPending(`route.${routePrefix}.#.on-pending.#`),
      queueEvents.taskPending(`route.${routePrefix}.#.on-transition.#`),
      queueEvents.taskRunning(`route.${routePrefix}.#.on-running.#`),
      queueEvents.taskRunning(`route.${routePrefix}.#.on-transition.#`),
      queueEvents.taskCompleted(`route.${routePrefix}.#.on-completed.#`),
      queueEvents.taskCompleted(`route.${routePrefix}.#.on-any.#`), // deprecated
      queueEvents.taskCompleted(`route.${routePrefix}.#.on-resolved.#`),
      queueEvents.taskCompleted(`route.${routePrefix}.#.on-transition.#`),
      queueEvents.taskFailed(`route.${routePrefix}.#.on-failed.#`),
      queueEvents.taskFailed(`route.${routePrefix}.#.on-any.#`), // deprecated
      queueEvents.taskFailed(`route.${routePrefix}.#.on-resolved.#`),
      queueEvents.taskFailed(`route.${routePrefix}.#.on-transition.#`),
      queueEvents.taskException(`route.${routePrefix}.#.on-exception.#`),
      queueEvents.taskException(`route.${routePrefix}.#.on-any.#`), // deprecated
      queueEvents.taskException(`route.${routePrefix}.#.on-resolved.#`),
      queueEvents.taskException(`route.${routePrefix}.#.on-transition.#`),
    ];
  }

  async listen() {
    this.pq = await consume({
      client: this.pulseClient,
      bindings: this.bindings,
      queueName: 'notifications',
    },
    this.monitor.timedHandler('notification', this.onMessage.bind(this)),
    );
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

  shouldNotifyOnDecider(decider, state) {
    if (decider === 'transition') {
      return true;
    }

    if ((decider === 'any' || decider === 'resolved') && ['completed', 'failed', 'exception'].includes(state)) {
      return true;
    }

    return decider === state;
  }

  async onMessage(message) {
    let { status } = message.payload;
    // If task was canceled, we don't send a notification since this was a deliberate user action
    if (status.state === 'exception') {
      if (this.ignoreTaskReasonResolved.includes((_.last(status.runs) || {}).reasonResolved)) {
        return null;
      }
    }

    // Load task definition
    let taskId = status.taskId;
    let task = await this.queue.task(taskId);
    let artifact = await this.queue.latestArtifact(taskId, 'public/logs/live.log');
    const res = await utils.throttleRequest({ url: artifact.url, method: 'GET' });

    let href = libUrls.ui(this.rootUrl, `tasks/${taskId}`);
    let groupHref = libUrls.ui(this.rootUrl, `tasks/groups/${task.taskGroupId}/tasks`);
    let runCount = status.runs.length;

    await Promise.allSettled(message.routes.map(async entry => {
      let route = entry.split('.');

      // convert from on- syntax to state. e.g. on-exception -> exception
      let decider = _.join(_.slice(route[route.length - 1], 3), '');
      if (!this.shouldNotifyOnDecider(decider, status.state)) {
        return;
      }

      switch (route[1]) {
        case 'matrix-room': {
          const roomId = route.slice(2, route.length - 1).join('.');
          let body = `'${task.metadata.name}' resolved as '${status.state}': ${href}`;
          let msgtype = _.get(task, 'extra.notify.matrixMsgtype') || 'm.notice';
          let formattedBody = undefined;
          let format = _.get(task, 'extra.notify.matrixFormat');
          if (_.has(task, 'extra.notify.matrixBody')) {
            body = this.renderMessage(task.extra.notify.matrixBody, { task, status, taskId, rootUrl: this.rootUrl });
          }
          if (_.has(task, 'extra.notify.matrixFormattedBody')) {
            formattedBody = this.renderMessage(task.extra.notify.matrixFormattedBody,
              { task, status, taskId, rootUrl: this.rootUrl });
          }
          try {
            return await this.notifier.matrix({
              roomId,
              format,
              formattedBody,
              body,
              msgtype,
            });
          } catch (err) {
            // This just means that we haven't been invited to the room yet
            if (err.errcode === 'M_FORBIDDEN') {
              return this.monitor.log.matrixForbidden({ roomId });
            }
            throw err;
          }
        }
        case 'slack-channel': {
          const channelId = route.slice(2, route.length - 1).join('.');

          const emojiMap = {
            pending: ':hourglass:',
            running: ':hammer_and_wrench:',
            completed: ':heavy_check_mark:',
            failed: ':x:',
            exception: ':heavy_exclamation_mark:',
          };
          const emoji = emojiMap[status.state] || ':question:';

          let text = `${emoji} *<${href}|${task.metadata.name}>* transitioned to _${status.state}_`;
          if (_.has(task, 'extra.notify.slackText')) {
            text = this.renderMessage(task.extra.notify.slackText, { task, status, taskId, rootUrl: this.rootUrl });
          }

          // This uses Slack blocks format, see https://api.slack.com/messaging/composing/layouts.
          let blocks = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text,
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `Part of task group *<${groupHref}|${task.taskGroupId}>*`,
                },
              ],
            },
          ];
          if (_.has(task, 'extra.notify.slackBlocks')) {
            blocks = this.renderMessage(task.extra.notify.slackBlocks, { task, status, taskId, rootUrl: this.rootUrl });
          }

          let attachments = [];
          if (_.has(task, 'extra.notify.slackAttachments')) {
            attachments = this.renderMessage(task.extra.notify.slackAttachments,
              { task, status, taskId, rootUrl: this.rootUrl });
          }

          return this.notifier.slack({
            channelId,
            text,
            blocks,
            attachments,
          });
        }
        case 'pulse': {
          return await this.notifier.pulse({
            routingKey: _.join(_.slice(route, 2, route.length - 1), '.'),
            message: status,
          });
        }
        case 'email': {
          let content = `
Task [\`${taskId}\`](${href}) in task-group [\`${task.taskGroupId}\`](${groupHref}) is complete.

**Status:** ${status.state} (in ${runCount} run${runCount === 1 ? '' : 's'})
**Name:** ${task.metadata.name}
**Description:** ${task.metadata.description}
**Owner:** ${task.metadata.owner}
**Source:** ${task.metadata.source}
          `;
          let link = { text: 'Inspect Task', href };
          let subject = `Task ${status.state}: ${task.metadata.name} - ${taskId}`;
          let template = 'simple';
          if (_.has(task, 'extra.notify.email')) {
            let extra = task.extra.notify.email;
            content = extra.content ? this.renderMessage(extra.content, { task, status, taskId, rootUrl: this.rootUrl })
              : content;
            subject = extra.subject ? this.renderMessage(extra.subject, { task, status, taskId, rootUrl: this.rootUrl })
              : subject;
            link = extra.link ? jsone(extra.link, { task, status, rootUrl: this.rootUrl }) : link;
            template = extra.template ? jsone(extra.template, { task, status }) : template;
          }
          return await this.notifier.email({
            address: _.join(_.slice(route, 2, route.length - 1), '.'),
            content,
            subject,
            link,
            template,
          });
        }
        default: {
          return null;
        }}
    }));
  }
}

// Export Handler
export default Handler;
