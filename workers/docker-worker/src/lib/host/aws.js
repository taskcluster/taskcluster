/**
Return the appropriate configuration defaults when on aws.
*/

const got = require('got-promise');
const taskcluster = require('taskcluster-client');
const _ = require('lodash');
const { createLogger } = require('../log');
const { spawn } = require('child_process');

let log = createLogger({
  source: 'host/aws'
});

let os = require('os');

function minutes(n) {
  return n * 60;
}

/**
AWS Metadata service endpoint.

@const
@see http://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AESDG-chapter-instancedata.html
*/
const BASE_URL = 'http://169.254.169.254/latest';

async function getText(url) {
  try {
    const res = await got(url);
    return res.body;
  }
  catch (e) {
    // Some meta-data endpoints 404 until they have a value to display (spot node termination)
    if (e.response.statusCode !== 404) throw e;
  }
}

async function getJsonData(url) {
  // query the user data for any instance specific overrides set by the
  // provisioner.
  try {
    const res = await got(url);
    return JSON.parse(res.body);
  } catch (err) {
    log(`${url} not available: ${err.stack || err}`);
  }
}

module.exports = {
  getText,
  getJsonData,

  /**
  @return Number of seconds this worker has been running.
  */
  billingCycleUptime() {
    return os.uptime();
  },

  /**
  Read AWS metadata and user-data to build a configuration for the worker.

  @param {String} [baseUrl] optional base url override (for tests).
  @return {Object} configuration values.
  */
  async configure(baseUrl=BASE_URL) {
    log('configure', { url: BASE_URL });

    // defaults per the metadata
    let metadata = await Promise.all([
      // host
      getText(baseUrl + '/meta-data/public-hostname'),
      // Public IP
      getText(baseUrl + '/meta-data/public-ipv4'),
      // Private IP
      getText(baseUrl + '/meta-data/local-ipv4'),
      // workerId
      getText(baseUrl + '/meta-data/instance-id'),
      // workerGroup
      getText(baseUrl + '/meta-data/placement/availability-zone'),
      // workerNodeType
      getText(baseUrl + '/meta-data/instance-type')
    ]);

    let config = {
      host: metadata[0],
      publicIp: metadata[1],
      privateIp: metadata[2],
      workerId: metadata[3],
      workerGroup: metadata[4].replace(/[a-z]$/, ''),
      workerNodeType: metadata[5],
      // for aws, instance ID and worker IDs are one and the same
      instanceId: metadata[3],
      // for aws, same as worker group
      region: metadata[4],
      // for aws, same as worker node type
      instanceType: metadata[5],
      // AWS Specific shutdown parameters notice this can also be overridden.
      shutdown: {
        enabled: true,
        // AWS does per second billing. So every second we are idling is wasting
        // money. However, we want machines waiting on work not work waiting on
        // machines. Furthermore, the value of a running machine is higher than
        // the value of a new machine because a) it has already paid the startup
        // cost b) it may have populated caches that can result in subsequent
        // tasks executing faster.
        afterIdleSeconds: minutes(15),
      }
    };

    log('metadata', config);

    let userdata = await getJsonData(`${baseUrl}/user-data`);
    let securityToken = userdata.securityToken;
    let provisionerBaseUrl = userdata.provisionerBaseUrl;

    log('read userdata', { text: userdata });

    let provisioner = new taskcluster.AwsProvisioner({
      baseUrl: provisionerBaseUrl
    });

    // Retrieve secrets
    let secrets;
    try {
      secrets = await provisioner.getSecret(securityToken);
    }
    catch (e) {
      // It's bad if secrets cannot be retrieved.  Either this could happen when
      // worker first starts up because of an issue communicating with the provisioner
      // or if the worker respawned (because of an uncaught exception).  Either way,
      // alert and set capacity to 0.
      log('[alert-operator] error retrieving secrets', {stack: e.stack});
      spawn('shutdown', ['-h', 'now']);
    }

    log('read secrets');

    await provisioner.removeSecret(securityToken);

    // Log config for record of configuration but without secrets
    log('config', config);

    // Order of these matter.  We want secret data to override all else, including
    // taskcluster credentials (if perma creds are provided by secrets.data)
    return _.defaultsDeep(
      secrets.data,
      {taskcluster: secrets.credentials},
      userdata.data,
      {
        capacity: userdata.capacity,
        workerType: userdata.workerType,
        provisionerId: userdata.provisionerId
      },
      config
    );
  },

  async getTerminationTime() {
    let url = BASE_URL + '/meta-data/spot/termination-time';
    let text = await getText(url);
    return text;
  }
};
