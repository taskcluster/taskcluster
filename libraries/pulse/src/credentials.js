const assert = require('assert');

/**
 * Build Pulse ConnectionString, from options on the form:
 * {
 *   username:          // Pulse username
 *   password:          // Pulse password
 *   hostname:          // Hostname to use
 *   vhost   :          // vhost to use
 *   amqps   :          // whether to use amqps over amqp (default true)
 * }
 */
const pulseCredentials = ({ username, password, hostname, vhost, amqps }) => {
  assert(username, 'options.username is required');
  assert(password, 'options.password is required');
  assert(hostname, 'options.hostname is required');
  assert(vhost, 'options.vhost is required');

  if (amqps === undefined) {
    amqps = true;
  }

  // Construct connection string
  return async () => {
    return {
      connectionString: [
        amqps ? 'amqps' : 'amqp',
        '://',
        encodeURIComponent(username),
        ':',
        encodeURIComponent(password),
        '@',
        hostname,
        ':',
        amqps ? 5671 : 5672,
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
