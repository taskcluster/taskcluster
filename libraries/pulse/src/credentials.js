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
