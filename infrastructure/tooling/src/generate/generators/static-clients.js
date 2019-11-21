const _ = require('lodash');
const {listServices, writeRepoJSON} = require('../../utils');
const {scopeCompare, normalizeScopeSet} = require('taskcluster-lib-scopes');

const SERVICES = listServices();

exports.tasks = [];

exports.tasks.push({
  title: 'Assemble static clients',
  requires: [
    ...SERVICES.map(name => `scopes-${name}`),
    ...SERVICES.map(name => `azure-${name}`),
  ],
  provides: ['static-clients'],
  run: async (requirements, utils) => {
    const staticClients = [];
    SERVICES.forEach(name => {
      // auth defines scopes, so it doesn't need any of its own.
      if (name === 'auth') {
        return;
      }

      const tables = (requirements[`azure-${name}`] || {}).tables || [];
      const scopes = [
        ...(requirements[`scopes-${name}`] || []),
        ...tables.map(t => 'auth:azure-table:read-write:${azureAccountId}/' + t),
      ];
      scopes.sort(scopeCompare);
      staticClients.push({
        clientId: `static/taskcluster/${name}`,
        scopes: normalizeScopeSet(scopes),
      });
    });

    staticClients.push({
      clientId: 'static/taskcluster/root',
      scopes: ['*'],
    });

    return {'static-clients': staticClients};
  },
});

exports.tasks.push({
  title: 'Configure static client scopes',
  requires: ['static-clients'],
  provides: [],
  run: async (requirements, utils) => {
    const staticClients = requirements['static-clients'];
    const staticScopes = staticClients.map(({clientId, scopes}) => ({clientId, scopes}));

    writeRepoJSON('services/auth/src/static-scopes.json', staticScopes);
  },
});
