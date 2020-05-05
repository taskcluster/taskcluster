/**
 * This code is executed early in the module-loading phase of every service.
 *
 * This is used to hook into the early startup process of node services.
 */
if (process.env.NEW_RELIC && process.env.NEW_RELIC !== '') {
  // set up new relic to load its config from environment variables encoded in $NEW_RELIC
  process.env.NEW_RELIC_NO_CONFIG_FILE = 'true';
  for (const [variable, value] of Object.entries(JSON.parse(process.env.NEW_RELIC))) {
    process.env[variable] = value;
  }
  delete process.env['NEW_RELIC'];
  require('newrelic');
}

if (process.env.USE_KUBERNETES_DNS_SERVICE_DISCOVERY) {
  require('taskcluster-client').setServiceDiscoveryScheme('k8s-dns');
}
