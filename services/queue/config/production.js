var Provider = require('nconf').Provider;

module.exports = function config() {
  var nconf = new Provider();

  // Load configuration from command line arguments, if requested
  nconf.argv();

  // Configurations elements loaded from commandline, these are the only
  // values we should ever really need to change.
  nconf.env({
    separator:  '__',
    whitelist:  [
      'queue__taskBucket',
      'queue__taskBucketIsCNAME',
      'queue__publishSchemas',
      'server__hostname',
      'server__port',
      'server__cookieSecret',
      'database__connectionString',
      'amqp__url',
      'aws__accessKeyId',
      'aws__secretAccessKey'
    ]
  });

  // Config from current working folder if present
  nconf.file('local', 'taskcluster-queue.conf.json');

  // User configuration
  nconf.file('user', '~/.taskcluster-queue.conf.json');

  // Global configuration
  nconf.file('global', '/etc/taskcluster-queue.conf.json');

  // defaults
  nconf.defaults(require('./defaults'));

  return nconf;
};
