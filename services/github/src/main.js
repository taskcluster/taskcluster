import Debug from 'debug';
import base from 'taskcluster-base';
import api from './api';
import path from 'path';
import Promise from 'promise';
import exchanges from './exchanges';
import worker from './worker';
import _ from 'lodash';
import taskcluster from 'taskcluster-client';
import Octokat from 'octokat';

let debug = Debug('taskcluster-github');

let load = base.loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => base.config({profile}),
  },

  drain: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      try {
        return new base.stats.Influx(cfg.influx);
      } catch (e) {
        debug('Missing influx connection string: stats collection disabled.');
      }
      return new base.stats.NullDrain();
    },
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => base.validator({
      prefix: 'github/v1/',
      aws: cfg.aws,
    }),
  },

  publisher: {
    requires: ['cfg', 'drain', 'validator', 'process', 'mockPublisher'],
    setup: async ({cfg, drain, validator, process, mockPublisher}) => {
      if (mockPublisher) {
        return {
          push: data => Promise.resolve(data),
          pullRequest: data => Promise.resolve(data),
        };
      } else {
        return await exchanges.setup({
          credentials:        cfg.pulse,
          exchangePrefix:     cfg.taskclusterGithub.exchangePrefix,
          validator:          validator,
          referencePrefix:    'github/v1/exchanges.json',
          publish:            cfg.taskclusterGithub.publishMetaData,
          aws:                cfg.aws,
          drain:              drain,
          component:          cfg.taskclusterGithub.statsComponent,
          process,
        });
      }
    },
  },

  github: {
    requires: ['cfg'],
    setup: ({cfg}) => new Octokat(cfg.github.credentials),
  },

  api: {
    requires: ['cfg', 'drain', 'validator', 'github', 'publisher'],
    setup: ({cfg, drain, validator, github, publisher}) => api.setup({
      context:          {publisher, cfg, github},
      authBaseUrl:      cfg.taskcluster.authBaseUrl,
      publish:          cfg.taskclusterGithub.publishMetaData,
      baseUrl:          cfg.server.publicUrl + '/v1',
      referencePrefix:  'github/v1/api.json',
      aws:              cfg.aws,
      component:        cfg.taskclusterGithub.statsComponent,
      validator,
      drain,
    }),
  },

  server: {
    requires: ['cfg', 'drain', 'api'],
    setup: ({cfg, drain, api}) => {

      base.stats.startProcessUsageReporting({
        component:  cfg.taskclusterGithub.statsComponent,
        process:    'server',
        drain,
      });

      debug('Launching server.');
      let app = base.app(cfg.server);
      app.use('/v1', api);
      return app.createServer();
    },
  },

  scheduler: {
    requires: ['cfg'],
    setup: ({cfg}) => new taskcluster.Scheduler(cfg.taskcluster),
  },

  webhooks: {
    requires: ['cfg', 'profile'],
    setup: ({cfg, profile}) => new taskcluster.PulseListener({
      queueName:  profile,
      credentials: {
        username: cfg.pulse.username,
        password: cfg.pulse.password,
      },
    }),
  },

  reference: {
    requires: ['cfg'],
    setup: ({cfg}) => exchanges.reference({
      exchangePrefix:   cfg.taskclusterGithub.exchangePrefix,
      credentials:      cfg.pulse,
    }),
  },

  worker: {
    requires: ['cfg', 'github', 'drain', 'scheduler', 'validator', 'reference', 'webhooks'],
    setup: async ({cfg, github, drain, scheduler, validator, reference, webhooks}) => {

      base.stats.startProcessUsageReporting({
        component:  cfg.taskclusterGithub.statsComponent,
        process:    'worker',
        drain,
      });

      let context = {cfg, github, scheduler, validator};
      let GitHubEvents = taskcluster.createClient(reference);
      let githubEvents = new GitHubEvents();

      // Attempt to launch jobs for any possible pull request action
      await webhooks.bind(githubEvents.pullRequest(
        {organization: '*', repository: '*', action: '*'}));

      // Launch jobs for push events as well.
      await webhooks.bind(githubEvents.push(
        {organization: '*', repository: '*'}));

      // Listen for, and handle, changes in graph/task state: to reset status
      // messages, send notifications, etc....
      let schedulerEvents = new taskcluster.SchedulerEvents();
      let route = 'route.taskcluster-github.*.*.*';
      webhooks.bind(schedulerEvents.taskGraphRunning(route));
      webhooks.bind(schedulerEvents.taskGraphBlocked(route));
      webhooks.bind(schedulerEvents.taskGraphFinished(route));

      // Route recieved messages to an appropriate handler via matching
      // exchange names to a regular expression
      let webHookHandlerExp = RegExp('(.*pull-request|.*push)', 'i');
      let graphChangeHandlerExp = RegExp('exchange/taskcluster-scheduler/.*', 'i');
      webhooks.on('message', function (message) {
        if (webHookHandlerExp.test(message.exchange)) {
          worker.webHookHandler(message, context);
        } else if (graphChangeHandlerExp.test(message.exchange)) {
          worker.graphStateChangeHandler(message, context);
        } else {
          debug('Ignoring message from unsupported exchange:', message.exchange);
        }
      });
      await webhooks.resume();
    },
  },
}, ['profile', 'process', 'mockPublisher']);

if (!module.parent) {
  load(process.argv[2], {
    process: process.argv[2],
    profile: process.env.NODE_ENV,
    mockPublisher: false,
  }).catch(err => {
    console.log(err.stack);
    process.exit(1);
  });
}

// Export load for tests
module.exports = load;
