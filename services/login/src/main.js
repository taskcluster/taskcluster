const _ = require('lodash');
const http = require('http');
const path = require('path');
const config = require('taskcluster-lib-config');
const User = require('./user');
const querystring = require('querystring');
const loader = require('taskcluster-lib-loader');
const taskcluster = require('taskcluster-client');
const scanner = require('./scanner');
const Authorizer = require('./authz');
const v1 = require('./v1');
const LDAPClient = require('./ldap');
const App = require('taskcluster-lib-app');
const validator = require('taskcluster-lib-validate');
const monitor = require('taskcluster-lib-monitor');
const docs = require('taskcluster-lib-docs');

let load = loader({
  cfg: {
    requires: ['profile'],
    setup: ({profile}) => {
      return config({profile});
    },
  },

  authorizer: {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let authorizer = new Authorizer(cfg);
      await authorizer.setup();
      return authorizer;
    },
  },

  handlers: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      let handlers = {};

      Object.keys(cfg.handlers).forEach((name) => {
        let Handler = require('./handlers/' + name);
        handlers[name] = new Handler({name, cfg});
      });
      return handlers;
    },
  },

  monitor: {
    requires: ['process', 'profile', 'cfg'],
    setup: ({process, profile, cfg}) => monitor({
      project: 'taskcluster-login',
      credentials: cfg.app.credentials,
      mock: profile !== 'production',
      process,
    }),
  },

  validator: {
    requires: ['cfg'],
    setup: ({cfg}) => {
      return validator({
        prefix: 'login/v1/',
        publish: cfg.app.publishMetaData,
        aws: cfg.aws,
      });
    },
  },

  router: {
    requires: ['cfg', 'validator', 'monitor', 'handlers', 'authorizer'],
    setup: ({cfg, validator, monitor, handlers, authorizer}) => {
      return v1.setup({
        context: {},
        validator,
        authBaseUrl:      cfg.authBaseUrl,
        publish:          cfg.app.publishMetaData,
        baseUrl:          cfg.server.publicUrl + '/v1',
        referencePrefix:  'login/v1/api.json',
        aws:              cfg.aws,
        monitor:          monitor.prefix('api'),
        context:          {cfg, handlers, authorizer},
      });
    },
  },

  docs: {
    requires: ['cfg', 'validator'],
    setup: ({cfg, validator}) => docs.documenter({
      credentials: cfg.app.credentials,
      tier: 'integrations',
      schemas: validator.schemas,
      references: [
        {
          name: 'api',
          reference: v1.reference({baseUrl: cfg.server.publicUrl + '/v1'}),
        },
      ],
    }),
  },

  app: {
    requires: ['cfg', 'docs', 'router'],
    setup: ({cfg, docs, router}) => {
      // Create application
      let app = App({
        port: cfg.server.port,
        publicUrl: cfg.server.publicUrl,
        env: cfg.server.env,
        forceSSL: cfg.server.forceSSL,
        trustProxy: cfg.server.trustProxy,
        rootDocsLink: true, // doesn't work?
        docs,
      });
      app.use('/v1', router);
      return app;
    },
  },

  server: {
    requires: ['cfg', 'app'],
    setup: async ({cfg, app}) => {
      // Create server and start listening
      return app.createServer();
    },
  },

  scanner: {
    requires: ['cfg', 'authorizer'],
    setup: async ({cfg, authorizer}) => {
      await scanner(cfg, authorizer);
      // the LDAP connection is still open, so we must exit
      // explicitly or node will wait forever for it to die.
      process.exit(0);
    },
  },

  // utility function to show LDAP groups for a user
  'show-ldap-user': {
    requires: ['cfg'],
    setup: async ({cfg}) => {
      let email = process.argv[3];
      if (!email) {
        console.error('Specify an email address on the command line');
        process.exit(1);
        return;
      }

      let client = new LDAPClient(cfg.ldap);
      client.bind(cfg.ldap.user, cfg.ldap.password);

      let userDn = await client.dnForEmail(email);

      if (!userDn) {
        console.error(`no user found for ${email}; skipping LDAP groups`);
        process.exit(1);
        return;
      }

      let entries = await client.search(
        'dc=mozilla', {
          scope: 'sub',
          filter: '(&(objectClass=groupOfNames)(member=' + userDn + '))',
          attributes: ['cn'],
          timeLimit: 10,
        });
      let groups = entries.map(entry => entry.object.cn);

      // SCM groups are posixGroup objects with the email in the memberUid
      // field.  This code does not capture other POSIX groups (which have the
      // user's uid field in the memberUid field).
      entries = await client.search(
        'dc=mozilla', {
          scope: 'sub',
          filter: '(&(objectClass=posixGroup)(memberUid=' + email + '))',
          attributes: ['cn'],
          timeLimit: 10,
        });
      groups = groups.concat(entries.map(entry => entry.object.cn));

      groups.sort();
      groups.forEach(gp => console.log(gp));

      process.exit(0);
    },
  },
}, ['profile', 'process']);

if (!module.parent) {
  load(process.argv[2], {
    profile: process.env.NODE_ENV,
    process: process.argv[2],
  }).catch(err => {
    console.log('Server crashed: ' + err.stack);
    process.exit(1);
  });
}

module.exports = load;
