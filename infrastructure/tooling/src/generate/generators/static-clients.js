import _ from 'lodash';
import { listServices, writeRepoJSON } from '../../utils/index.js';
import { scopeCompare, normalizeScopeSet } from 'taskcluster-lib-scopes';

const SERVICES = listServices();

export const tasks = [];

tasks.push({
  title: 'Assemble static clients',
  requires: [
    ...SERVICES.map(name => `scopes-${name}`),
  ],
  provides: ['static-clients'],
  run: async (requirements, utils) => {
    const staticClients = [];
    SERVICES.forEach(name => {
      // auth defines scopes, so it doesn't need any of its own.
      if (name === 'auth') {
        return;
      }

      const scopes = requirements[`scopes-${name}`] || [];
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

    return { 'static-clients': staticClients };
  },
});

tasks.push({
  title: 'Configure static client scopes',
  requires: ['static-clients'],
  provides: [],
  run: async (requirements, utils) => {
    const staticClients = requirements['static-clients'];
    const staticScopes = staticClients.map(({ clientId, scopes }) => ({ clientId, scopes }));

    writeRepoJSON('services/auth/src/static-scopes.json', staticScopes);
  },
});
