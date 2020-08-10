const assert = require('assert');

/**
 * Build Pulse ConnectionString, from options on the form:
 * {
 *   username:          // Pulse username
 *   password:          // Pulse password
 *   hostname:          // Hostname to use
 *   vhost   :          // vhost to use
 * }
 */
const pulseCredentials = ({ username, password, hostname, vhost }) => {
  assert(username, 'options.username is required');
  assert(password, 'options.password is required');
  assert(hostname, 'options.hostname is required');
  assert(vhost, 'options.vhost is required');

  // Construct connection string
  return async () => {
    return {
      connectionString: [
        'amqps://', // Ensure that we're using SSL
        encodeURIComponent(username),
        ':',
        encodeURIComponent(password),
        '@',
        hostname,
        ':',
        5671, // Port for SSL
        '/',
        encodeURIComponent(vhost),
        // don't artificially limit frame size (https://bugzilla.mozilla.org/show_bug.cgi?id=1582376)
        '?frameMax=0',
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
    return { connectionString };
  };
};

exports.connectionStringCredentials = connectionStringCredentials;
