/**
Return the appropriate configuration defaults when on aws.
*/

import request from 'superagent-promise';
import Debug from 'debug'

let debug = Debug('docker-worker:configuration:aws');
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
export async function configure(baseUrl) {
  baseUrl = baseUrl || BASE_URL;
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

  // query the user data for any instance specific overrides set by the
  // provisioner.
  let userdata = await request.get(baseUrl + '/user-data').
    // Buffer entire response into the .text field of the response.
    buffer(true).
    // Issue the request...
    end();

  if (!userdata.ok || !userdata.text) {
    log('userdata not available')
    return config;
  }
  // parse out overrides from user data
  log('read userdata', { text: userdata.text });
  let overrides = JSON.parse(userdata.text);
  for (var key in overrides) config[key] = overrides[key];

  log('final config', config);
  return config;
};

export async function getTerminationTime() {
  let url = BASE_URL + '/meta-data/spot/termination-time';
  let text = await getText(url);
  return text;
}
