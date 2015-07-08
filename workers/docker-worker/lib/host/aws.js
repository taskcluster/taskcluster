/**
Return the appropriate configuration defaults when on aws.
*/

import request from 'superagent-promise';
import taskcluster from 'taskcluster-client';

let log = require('../log')({
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

export async function getText(url) {
  let res = await request.get(url).end();
  // Some meta-data endpoints 404 until they have a value to display (spot node termination)
  let text = res.ok ? res.text : '';
  return text;
}

async function getJsonData(url) {
  // query the user data for any instance specific overrides set by the
  // provisioner.
  let jsonData = await request.get(url).buffer().end();

  if (!jsonData.ok || !jsonData.text) {
    log(`${url} not available`);
    return {};
  }

  return JSON.parse(jsonData.text);
}

/**
@return Number Billing cycle interval in seconds.
*/
export function billingCycleInterval() {
  return minutes(60);
}

/**
@return Number of seconds this worker has been running.
*/
export function billingCycleUptime() {
  return os.uptime();
}

/**
Read AWS metadata and user-data to build a configuration for the worker.

@param {String} [baseUrl] optional base url override (for tests).
@return {Object} configuration values.
*/
export async function configure(baseUrl=BASE_URL) {
  log('configure', { url: BASE_URL });

  // defaults per the metadata
  let metadata = await Promise.all([
    // host
    getText(baseUrl + '/meta-data/public-hostname'),
    // Public IP
    getText(baseUrl + '/meta-data/public-ipv4'),
    // workerId
    getText(baseUrl + '/meta-data/instance-id'),
    // workerType
    getText(baseUrl + '/meta-data/ami-id'),
    // workerGroup
    getText(baseUrl + '/meta-data/placement/availability-zone'),
    // workerNodeType
    getText(baseUrl + '/meta-data/instance-type')
  ]);

  let config = {
    provisionerId: 'aws-provisioner',
    host: metadata[0],
    publicIp: metadata[1],
    workerId: metadata[2],
    workerType: metadata[3],
    workerGroup: metadata[4],
    workerNodeType: metadata[5],
    // AWS Specific shutdown parameters notice this can also be overridden.
    shutdown: {
      enabled: true,
      // Always wait 2 minutes minimum prior to shutting down this node.
      minimumCycleSeconds: minutes(2),
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
  let secrets = await provisioner.getSecret(securityToken);

  log('read secrets');

  await provisioner.removeSecret(securityToken);

  // Log config for record of configuration but without secrets
  log('config', config);

  return Object.assign(
    config,
    {capacity: userdata.capacity},
    userdata.data,
    {taskcluster: secrets.credentials},
    secrets.data
  );
}

export async function getTerminationTime() {
  let url = BASE_URL + '/meta-data/spot/termination-time';
  let text = await getText(url);
  return text;
}
