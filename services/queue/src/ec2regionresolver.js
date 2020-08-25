let { Netmask } = require('netmask');
let requestIp = require('request-ip');
let request = require('superagent');
let assert = require('assert');
let fs = require('fs');
let path = require('path');

// Static URL from which ip-ranges from AWS services can be fetched
const AWS_IP_RANGES_URL = 'https://ip-ranges.amazonaws.com/ip-ranges.json';
// cached set of IP ranges for use until and unless the URL can be loaded
const LOCAL_IP_RANGES = path.join(__dirname, 'ip-ranges.json');

/** Resolve EC2 region from request using AWS ip-ranges */
class EC2RegionResolver {
  /** Construct EC2RegionResolver given a list of regions we care about */
  constructor(regions, monitor) {
    assert(regions instanceof Array, 'regions must be an array');
    this.regions = regions;
    this.monitor = monitor;
    this.ipRanges = [];
  }

  /**
   * Start running the resolver.  This will return immediately while loading the
   * list of IP ranges.  Until that load is complete, the resolver will return
   * null (meaning not an EC2 region) for all IPs.
   */
  start() {
    let delay = 500;
    this._running = true;

    // load a cached set of regions to start with
    this._loadIpRanges();

    // then begin trying to load the latest from AWS
    this._fetchPromise = new Promise(resolve => {
      const tryLoad = async () => {
        if (!this._running) {
          return resolve();
        }

        try {
          await this._fetchIpRanges();
          return resolve();
        } catch (err) {
          this.monitor.warning(`Failed to download AWS IP ranges (retrying): ${err}`);
          setTimeout(tryLoad, delay);
          delay *= 2;
        }
      };
      tryLoad();
    });
  }

  /**
   * Return when the IP ranges are loaded
   */
  async waitForFetch() {
    await this._fetchPromise;
  }

  /**
   * Stop the resolver.  When this returns, no loading operations are ongoing.
   */
  async stop() {
    this._running = false;
    await this._fetchPromise;
  }

  /**
   * Load IP ranges from the local file in this directory
   */
  async _loadIpRanges() {
    let body = JSON.parse(fs.readFileSync(LOCAL_IP_RANGES));
    this._setIpRanges(body);
  }

  /**
   * Fetch IP ranges from AWS
   */
  async _fetchIpRanges() {
    // Get IP ranges from AWS
    let { body } = await request.get(AWS_IP_RANGES_URL);
    this._setIpRanges(body);
  }

  _setIpRanges(body) {
    // Add ip-ranges to regions
    this.ipRanges = body.prefixes.filter(prefix => {
      // Filter ip-ranges we're interested in
      return prefix.service === 'EC2' &&
             this.regions.indexOf(prefix.region) !== -1;
    }).map(prefix => {
      return {
        range: new Netmask(prefix.ip_prefix),
        region: prefix.region,
      };
    });
  }

  /** Get region that request originates from, or null if none */
  getRegion(req) {
    let ip = requestIp.getClientIp(req);
    // discard ipv6 addresses
    if (!/^(:?\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
      return null;
    }
    for (let { range, region } of this.ipRanges) {
      if (range.contains(ip)) {
        return region;
      }
    }
    return null;
  }
}

// Export EC2RegionResolver
module.exports = EC2RegionResolver;
