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

  'taskcluster.clientId': {
    description: 'Taskcluster client id',
    value: process.env.TASKCLUSTER_CLIENT_ID
  },

  'taskcluster.accessToken': {
    description: 'Taskcluster access token',
    value: process.env.TASKCLUSTER_ACCESS_TOKEN
  },

  'statsd.prefix': {
    description: 'statsd prefix token',
    value: process.env.STATSD_PREFIX
  },

  'statsd.host': {
    description: 'statsd hostname endpoint',
    value: parseUri('STATSD_URL').hostname
  },

  'statsd.port': {
    description: 'statsd port endpoint',
    value: parseUri('STATSD_URL').port
  },

  'loggly.account': {
    description: 'Loggly account name',
  },

  'loggly.token': {
    description: 'Loggly authentication token',
  },

  'filesystem': {
    description: 'Docker filesystem type (aufs, btrfs)',
    value: 'aufs'
  },

  'papertrail': {
    description: 'Papertrail host + port'
  },

  'influxdb.host': {
    description: 'Influxdb hostname',
    value: parseUri('INFLUXDB_URL').hostname
  },

  'influxdb.port': {
    description: 'Influxdb port',
    value: parseUri('INFLUXDB_URL').port
  },

  'influxdb.username': {
    description: 'Influxdb username',
    value: parseUri('INFLUXDB_URL').username,
  },

  'influxdb.password': {
    description: 'Influxdb passsword',
    value: parseUri('INFLUXDB_URL').password,
  },

  'influxdb.database': {
    description: 'Influxdb database',
    value: parseUri('INFLUXDB_URL').database,
  }
};
