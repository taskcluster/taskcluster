var url = require('url');

function parseUri(env) {
  var value = process.env[env];
  if (!value) return {};

  // Parse the url if available...
  value = url.parse(value);

  var userPass = value.auth && value.auth.split(':');
  if (userPass) {
    value.username = userPass[0];
    value.password = userPass[1];
  }

  if (value.pathname && value.pathname.length) {
    value.database = value.pathname.slice(1);
  }

  return value;
}

/**
To deploy the worker we need a number of "variables" which are used to construct
various config files. This contains the list of all variables used in the deploy
process with their description and default values... This is used in the
interactive mode of the deploy process...
*/
module.exports = {
  'debug.level': {
    description: 'Debug level for worker (see debug npm module)',
    value: '*'
  },

  'privateKeyLocation': {
    description: 'Location of private RSA key for docker-worker'
  },

  'filesystem': {
    description: 'Docker filesystem type (overlay2)',
    value: 'overlay2'
  },

  'papertrail': {
    description: 'Papertrail host + port'
  },

  'sslCertificateLocation': {
    description: 'Location of SSL certificate for secure things like live logging'
  },

  'sslKeyLocation': {
    description: 'Location of SSL key for secure things like live logging'
  },

  'cotSigningKey': {
    description: 'Location of chain of trust signing key'
  }
};
