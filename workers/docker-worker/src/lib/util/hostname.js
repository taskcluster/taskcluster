const assert = require('assert');
const statelessDNSServer = require('stateless-dns-server');

module.exports = function getHostname(config, expires) {
  let statelessConfig = config.statelessHostname || {};
  if (!statelessConfig || !statelessConfig.secret || !statelessConfig.domain) {
    return config.host;
  }

  let secret = statelessConfig.secret;
  let domain = statelessConfig.domain;
  let ip = config.publicIp;
  assert(ip, 'Public IP is not specified in the configuration');

  let hostname;
  ip = ip.split('.').map((octet) => { return parseInt(octet); });
  hostname  = statelessDNSServer.createHostname(
    ip,
    expires,
    secret,
    domain
  );

  return hostname;
};
