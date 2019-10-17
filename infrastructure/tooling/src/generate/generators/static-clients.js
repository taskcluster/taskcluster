const _ = require('lodash');
const {listServices, writeRepoJSON} = require('../../utils');

// We're not going to deploy login into k8s
const SERVICES = listServices().filter(s => !['login'].includes(s));

exports.tasks = [];

exports.tasks.push({
  title: 'Assemble static clients',
  requires: [
    ...SERVICES.map(name => `scopes-${name}`),
  ],
  provides: ['static-clients'],
  run: async (requirements, utils) => {
    const staticClients = [];
    SERVICES.forEach(name => {
      const scopes = requirements[`scopes-${name}`];
      if (scopes) {
        staticClients.push({
          clientId: `static/taskcluster/${name}`,
          scopes: scopes,
        });
      }
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
