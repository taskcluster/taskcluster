const assert = require('assert');
const taskcluster = require('taskcluster-client');

/**
 * Build Pulse ConnectionString, from options on the form:
 * {
 *   username:          // Pulse username
 *   password:          // Pulse password
 *   hostname:          // Hostname to use
 *   vhost   :          // vhost to use
 * }
 */
const pulseCredentials = ({username, password, hostname, vhost}) => {
  assert(username, 'options.username is required');
  assert(password, 'options.password is required');
  assert(hostname, 'options.hostname is required');
  assert(vhost, 'options.vhost is required');
  
  // Construct connection string
  return async () => {
    return {
      connectionString: [
        'amqps://',         // Ensure that we're using SSL
        encodeURI(username),
        ':',
        encodeURI(password),
        '@',
        hostname,
        ':',
        5671,                // Port for SSL
        '/',
        encodeURIComponent(vhost),
      ].join(''),
    };
  };
};

exports.pulseCredentials = pulseCredentials;

/**
  * Simply returns the same connectionstring send as a parameter,wrapped with an async function
 */
const connectionStringCredentials = (connectionString) => {
  return async () => {
    return {connectionString};
  };
};

exports.connectionStringCredentials = connectionStringCredentials;

/**
   * Get pulse credentials using taskcluster credentials and build connection string 
   * using taskcluster pulse service.
   * Further it caches the connection credentials with an expiry date of reclaimAt
*/
const claimedCredentials = ({rootUrl, credentials, namespace, expiresAfter, contact}) => {
  assert(rootUrl, 'rootUrl is required');
  assert(credentials, 'credentials is required');
  assert(namespace, 'namespace is required');

  const pulse = new taskcluster.Pulse({
    credentials,
    rootUrl,
  });

  let connectionString, recycleAt;

  return async () => {
    const res = await pulse.claimNamespace(namespace, {
      expires: taskcluster.fromNow(expiresAfter || '4 hours'),
      contact,
    });
    connectionString = res.connectionString;
    recycleAt = res.reclaimAt;
    return {connectionString, recycleAt};
  };
};

exports.claimedCredentials = claimedCredentials;

/**
 * Mocks the claimedCredentials function by returning returning the same 
 * connectionString, recycleAt passed as parametrs with recycleAt defaults 
 * to 5s from the date of calling it.
 */
const mockClaimedCredentials = (connectionString, recycleAt) => {
  recycleAfter = recycleAt || taskcluster.fromNow('5 seconds');

  return async () => {
    return {connectionString, recycleAt};
  };
};

exports.mockClaimedCredentials = mockClaimedCredentials;
