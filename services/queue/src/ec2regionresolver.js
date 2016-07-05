let {Netmask} = require('netmask');
let requestIp = require('request-ip');
let request   = require('superagent-promise');
let assert    = require('assert');

// Static URL from which ip-ranges from AWS services can be fetched
const AWS_IP_RANGES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';

/** Resolve EC2 region from request using AWS ip-ranges */
class EC2RegionResolver {
  /** Construct EC2RegionResolver given a list of regions we care about */
  constructor(regions) {
    assert(regions instanceof Array, 'regions must be an array');
    this.regions = regions;
    this.ipRanges = [];
  }

  async loadIpRanges() {
    // Get IP ranges from AWS with really stupid retry logic
    var {body} = await request.get(AWS_IP_RANGES_URL).end().catch(() => {
      return request.get(AWS_IP_RANGES_URL).end().catch(() => {
        return request.get(AWS_IP_RANGES_URL).end();
      });
    });

    // Add ip-ranges to regions
    this.ipRanges = body.prefixes.filter(prefix => {
      // Filter ip-ranges we're interested in
      return prefix.service === 'EC2' &&
             this.regions.indexOf(prefix.region) !== -1;
    }).map(prefix => {
      return {
        range:    new Netmask(prefix.ip_prefix),
        region:   prefix.region,
      };
    });
  }

  /** Get region that request originates from, or null if none */
  getRegion(req) {
    var ip = requestIp.getClientIp(req);
    // discard ipv6 addresses
    if (!/^(:?\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      return null;
    }
    for (var {range, region} of this.ipRanges) {
      if (range.contains(ip)) {
        return region;
      }
    }
    return null;
  }
}

// Export EC2RegionResolver
module.exports = EC2RegionResolver;

