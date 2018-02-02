const iptables = require('iptables');
const dns = require('dns');
const request = require('request-promise-native');

// When test an S3 retry upload, we have to block all the IP ranges for S3 service
// in the us-west-2 region.
const AWS_IP_ADDRESSES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

let rejectRules;
let deleteRules;

async function init() {
  const ipRanges = await request.get({
    uri: AWS_IP_ADDRESSES_URL, 
    json: true,
    headers: {
      'User-Agent': 'docker-worker',
    },
  });

  const ips = ipRanges.prefixes
    .filter(x => x.region === 'us-west-2' && x.service.toLowerCase() === 's3')
    .map(x => x.ip_prefix);

  rejectRules = ips.map(ip => {
    return {
      chain: 'OUTPUT',
      protocol: 'tcp',
      dst: ip,
      dport: 443,
      sudo: true,
    };
  });

  deleteRules = ips.map(ip => {
    return {
      chain: 'OUTPUT',
      protocol: 'tcp',
      target: 'REJECT',
      dst: ip,
      dport: 443,
      sudo: true,
    };
  });
}

function blockArtifact() {
  rejectRules.map(r => iptables.reject(r));
}

function allowArtifact(addr) {
  deleteRules.map(r => iptables.deleteRule(r));
}

module.exports = {
  blockArtifact,
  allowArtifact,
  init,
};
