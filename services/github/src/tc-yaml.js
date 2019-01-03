const jparam = require('json-parameterization');
const _ = require('lodash');
const slugid = require('slugid');
const jsone = require('json-e');
const tc = require('taskcluster-client');

// Assert that only scope-valid characters are in branches
const branchTest = /^[\x20-\x7e]*$/;

class TcYaml {
  static instantiate(version) {
    if (version === 0) {
      return new VersionZero();
    } else {
      return new VersionOne();
    }
  }
}

class VersionZero extends TcYaml {
  constructor() {
    super();
    this.version = 0;
  }

  /**
 * Attach fields to a compiled taskcluster github config so that
 * it becomes a complete task graph config.
 **/
  completeInTreeConfig(config, payload) {
    config.scopes = [];
    if (!branchTest.test(payload.details['event.base.repo.branch'] || '')) {
      throw new Error('Cannot have unicode in branch names!');
    }
    if (!branchTest.test(payload.details['event.head.repo.branch'] || '')) {
      throw new Error('Cannot have unicode in branch names!');
    }

    if (payload.details['event.type'].startsWith('pull_request')) {
      config.scopes = [
        `assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`,
      ];
    } else if (payload.details['event.type'] === 'push') {
      let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:branch:`;
      config.scopes = [
        prefix + payload.details['event.base.repo.branch'],
      ];
    } else if (payload.details['event.type'] === 'release') {
      config.scopes = [
        `assume:repo:github.com/${ payload.organization }/${ payload.repository }:release`,
      ];
    } else if (payload.details['event.type'] === 'tag') {
      let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:tag:`;
      config.scopes = [
        prefix + payload.details['event.head.tag'],
      ];
    }

    // each task can optionally decide if it wants github specific environment
    // variables added to it
    let stringify = x => x ? `${x}` : x;
    config.tasks = config.tasks.map((task) => {
      if (task.task.extra.github.env) {
        task.task.payload.env = _.merge(
          task.task.payload.env || {}, {
            GITHUB_EVENT: payload.details['event.type'],
            GITHUB_BRANCH: payload.details['event.base.repo.branch'],
            GITHUB_PULL_REQUEST: stringify(payload.details['event.pullNumber']),
            GITHUB_PULL_TITLE: stringify(payload.details['event.title']),
            GITHUB_BASE_REPO_NAME: payload.details['event.base.repo.name'],
            GITHUB_BASE_REPO_URL: payload.details['event.base.repo.url'],
            GITHUB_BASE_USER: payload.details['event.base.user.login'],
            GITHUB_BASE_SHA: payload.details['event.base.sha'],
            GITHUB_BASE_BRANCH: payload.details['event.base.repo.branch'],
            GITHUB_BASE_REF: payload.details['event.base.ref'],
            GITHUB_HEAD_REPO_NAME: payload.details['event.head.repo.name'],
            GITHUB_HEAD_REPO_URL: payload.details['event.head.repo.url'],
            GITHUB_HEAD_USER: payload.details['event.head.user.login'],
            GITHUB_HEAD_SHA: payload.details['event.head.sha'],
            GITHUB_HEAD_BRANCH: payload.details['event.head.repo.branch'],
            GITHUB_HEAD_TAG: payload.details['event.head.tag'],
            GITHUB_HEAD_REF: payload.details['event.head.ref'],
            GITHUB_HEAD_USER_EMAIL: payload.details['event.head.user.email'],
          }
        );
      }
      return task;
    });
    return config;
  }

  substituteParameters(config, cfg, payload) {
    return jparam(config, _.merge(payload.details, {
      $fromNow: (text) => tc.fromNowJSON(text),
      timestamp: Math.floor(new Date()),
      organization: payload.organization,
      repository: payload.repository,
      'taskcluster.docker.provisionerId': cfg.intree.provisionerId,
      'taskcluster.docker.workerType': cfg.intree.workerType,
    }));
  }
  compileTasks(config, cfg, payload, now) {
    config.tasks = config.tasks.map((task) => {
      task.routes = task.routes || [];
      task.routes.push(cfg.app.statusTaskRoute);

      return {
        taskId: slugid.nice(),
        task,
      };
    }).filter((task) => {
      // Filter out tasks that aren't associated with github at all, or with
      // the current event being handled
      if (!task.task.extra || !task.task.extra.github) {
        return false;
      }

      let event = payload.details['event.type'];
      let events = task.task.extra.github.events;
      let branch = payload.details['event.base.repo.branch'];
      let includeBranches = task.task.extra.github.branches;
      let excludeBranches = task.task.extra.github.excludeBranches;

      if (includeBranches && excludeBranches) {
        throw new Error('Cannot specify both `branches` and `excludeBranches` in the same task!');
      }

      return _.some(events, ev => {
        if (!event.startsWith(_.trimEnd(ev, '*'))) {
          return false;
        }

        if (event !== 'push') {
          return true;
        }

        if (includeBranches) {
          return _.includes(includeBranches, branch);
        } else if (excludeBranches) {
          return !_.includes(excludeBranches, branch);
        } else {
          return true;
        }
      });
    });

    // Add common taskGroupId and schedulerId. taskGroupId is always the taskId of the first
    // task in taskcluster.
    if (config.tasks.length > 0) {
      let taskGroupId = config.tasks[0].taskId;
      config.tasks = config.tasks.map((task) => {
        return {
          taskId: task.taskId,
          task: _.extend(task.task, {taskGroupId, schedulerId: cfg.taskcluster.schedulerId}),
        };
      });
    }
    return this.completeInTreeConfig(config, payload);
  }
}

class VersionOne extends TcYaml {
  constructor() {
    super();
    this.version = 1;
  }

  /**
 * Get scopes and attach them to the task.
 * v1 function
 */
  createScopes(config, payload) {
    if (payload.tasks_for === 'github-pull-request') {
      config.scopes = [
        `assume:repo:github.com/${ payload.organization }/${ payload.repository }:pull-request`,
      ];
    } else if (payload.tasks_for === 'github-push') {
      if (payload.body.ref.split('/')[1] === 'tags') {
        let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:tag:`;
        config.scopes = [
          prefix + payload.details['event.head.tag'],
        ];
      } else {
        let prefix = `assume:repo:github.com/${ payload.organization }/${ payload.repository }:branch:`;
        config.scopes = [
          prefix + payload.details['event.base.repo.branch'],
        ];
      }
    } else if (payload.tasks_for === 'github-release') {
      config.scopes = [
        `assume:repo:github.com/${ payload.organization }/${ payload.repository }:release`,
      ];
    }

    return config;
  }

  substituteParameters(config, cfg, payload) {
    if (!branchTest.test(payload.branch || '')) {
      throw new Error('Cannot have unicode in branch names!');
    }
    if (!branchTest.test(payload.branch || '')) {
      throw new Error('Cannot have unicode in branch names!');
    }

    let slugids = {};
    let as_slugid = (label) => {
      let rv;
      if (rv = slugids[label]) {
        return rv;
      } else {
        return slugids[label] = slugid.nice();
      }
    };

    try {
      return jsone(config, {
        tasks_for: payload.tasks_for,
        event: payload.body,
        as_slugid,
      });
    } catch (err) {
      // json-e creates errors that have properties in a format
      // that taskcluster-github messes up. Just fixing it here.
      if (err.toString && err.location) {
        throw new Error(err.toString());
      }
      throw err;
    }
  }

  compileTasks(config, cfg, payload, now) {
    if (config.tasks.length > 0) {
      // default taskGroupId and taskId
      // - if only one task, make these match (making the task appear to be a decision task)
      // - if two or more tasks, make them different (so that the taskgroup has no decision task)
      // of course, this can be overriden by users specifying these values.
      let defaultTaskId;
      let defaultTaskGroupId;
      if (config.tasks.length === 1) {
        let soleTask = config.tasks[0];
        if (soleTask.taskId && soleTask.taskGroupId) {
          // Nothing to do. Everything is already defined.
        } else if (soleTask.taskId) {
          defaultTaskGroupId = soleTask.taskId;
        } else if (soleTask.taskGroupId) {
          defaultTaskId = soleTask.taskGroupId;
        } else {
          defaultTaskId = slugid.nice();
          defaultTaskGroupId = defaultTaskId;
        }
      } else {
        defaultTaskId = slugid.nice();
        defaultTaskGroupId = slugid.nice();
      }

      config.tasks = config.tasks.map(task => {
        task.routes = task.routes || [];
        task.routes.push(config.reporting ? cfg.app.checkTaskRoute : cfg.app.statusTaskRoute);

        task = Object.assign({
          taskId: defaultTaskId,
          taskGroupId: defaultTaskGroupId,
          created: now,
        }, task);
        defaultTaskId = slugid.nice(); // invent a new taskId for the next task

        const {taskId, ...taskWithoutTaskId} = task;
        return {
          taskId,
          task: {
            ...taskWithoutTaskId,
            schedulerId: cfg.taskcluster.schedulerId,
          },
        };
      });
    }
    return this.createScopes(config, payload);
  }
}

module.exports = TcYaml;
