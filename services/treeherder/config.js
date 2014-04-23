var nconf   = require('nconf');
var client  = require('taskcluster-client');

/** Default configuration values */
var DEFAULT_CONFIG_VALUES = {
  // taskcluster-treeHerder specific configuration
  treeherder: {
    // AMQP queue named to use when subscribing to events, leave it undefined
    // to use an exclusive queue that will be automatically deleted. This is
    // useful for testing. Note, that the production queue should not be used
    // during development, and this will take messages
    // In production we'll use `taskcluster-treeherder`
    amqpQueueName:                  undefined,

    // Routing key to look for as first entry in task-graph routing, in
    // production we shall use `treeherder-reporting`, but to avoid messing with
    // production during tests `jonasfj-test-th-report` is appropriate.
    routingKeyPrefix:               'jonasfj-test-t2-report',

    // Branches we're allowed to post to, space separated list
    branches:       "try-taskcluster",

    // TreeHerder Credentials obtained from an ateam member (try jeads)
    consumerKey:                    null,
    consumerSecret:                 null
  },

  // old config entries
  queue: {
    baseUrl:'http://queue.taskcluster.net'
  },
  // Configuration of API end-points
  apis: {
    // Use default baseUrls by default
  }
};

var loaded = false;
/** Load configuration */
exports.load = function() {
  if (loaded) {
    return;
  }
  loaded = true;

  // Load configuration from command line arguments, if requested
  nconf.argv();

  // Configurations elements loaded from commandline, these are the only
  // values we should ever really need to change.
  nconf.env({
    separator:  '__',
    whitelist:  [
      'treeherder__routingKeyPrefix',
      'treeherder__amqpQueueName',
      'treeherder__consumerKey',
      'treeherder__consumerSecret'
    ]
  });

  // Config from current working folder if present
  nconf.file('local', 'taskcluster-treeherder.conf.json');

  // User configuration
  nconf.file('user', '~/.taskcluster-treeherder.conf.json');

  // Global configuration
  nconf.file('global', '/etc/taskcluster-treeherder.conf.json');

  // Load default configuration
  nconf.defaults(DEFAULT_CONFIG_VALUES);

  // Set baseUrls for taskcluster-client
  client.config(nconf.get('apis'));
}
