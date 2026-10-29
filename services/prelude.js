import pkg from '@taskcluster/client';
const { setServiceDiscoveryScheme } = pkg;

/**
 * This code is executed early in the module-loading phase of every service.
 *
 * This is used to hook into the early startup process of node services.
 */
if (process.env.USE_KUBERNETES_DNS_SERVICE_DISCOVERY) {
  setServiceDiscoveryScheme('k8s-dns');
}
