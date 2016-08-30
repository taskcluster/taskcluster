/**
The docker worker has a number of features all of which are optional and can be
enabled/disabled at will... This module defines the list of features and which
module is responsible for handling them.
*/

import _ from 'lodash';
import assert from 'assert';

const features = {
  localLiveLog: {
    title: 'Enable live logging (worker local)',
    description: 'Logs are stored on the worker during the duration of tasks ' +
                 'and available via http chunked streaming then uploaded to s3',
    defaults: true,
    module: require('./features/local_live_log')
  },

  generateCertificate: {
    title: 'Enable generation of a certificate for Chain of Trust',
    description: 'A certificate should be generated which will include information ' +
                 'for downstream tasks to build a level of trust for the artifacts ' +
                 'produced by the task and the environment it ran in.',
    defaults: false,
    module: require('./features/certificate_of_trust')
  },

  // the structure is [name] = { defaults: true/false, module: Handler }
  azureLiveLog: {
    title: 'Enable live logging (via azure blobs)',
    description: 'Useful for situations where it is impossible to reach the ' +
                 'worker and parsing the azure livelog is possible',

    defaults: false,
    module: require('./features/azure_live_log')
  },

  bulkLog: {
    title: 'Bulk upload the task log into a single artifact',
    description: 'Useful if live logging is not interesting but the overall' +
                 'log is later on',

    defaults: false,
    module: require('./features/bulk_log')
  },

  taskclusterProxy: {
    title: 'Task cluster auth proxy service',
    description: 'The auth proxy allows making requests to taskcluster/queue ' +
                 'and taskcluster/scheduler directly from your task with the ' +
                 'same scopes as set in the task. This can be used to make ' +
                 'api calls via the [client](https://github.com/taskcluster/taskcluster-client) ' +
                 'CURL, etc... Without embedding credentials in the task.',


    defaults: false,
    module: require('./features/taskcluster_proxy')
  },

  testdroidProxy: {
    title: 'Testdroid proxy service',
    description: '',
    defaults: false,
    module: require('./features/testdroid_proxy')
  },

  balrogVPNProxy: {
    title: 'Balrog proxy service',
    description: 'The Balrog proxy feature allows tasks to make requests to ' +
                 'http://balrog which is a proxied connection through a vpn ' +
                 'tunnel to production balrog update server.',
    defaults: false,
    module: require('./features/balrog_vpn_proxy')
  },

  artifacts: {
    title: 'Artifact uploads',
    description: '',
    defaults: true,
    module: require('./features/artifacts')
  },

  extendTaskGraph: {
    title: 'Task graph extensions',
    description: 'The `.graphs` property in payload allows specifying paths ' +
                 'which if present will be used to extend the task graph ' +
                 '(Keeping it alive) this can be used for dynamic tests, ' +
                 'bisections, any dynamic tasks, etc...',
    defaults: true,
    module: require('./features/extend_task_graph')
  },

  dind: {
    title: 'Docker in Docker',
    description: 'Runs docker-in-docker and binds `/var/run/docker.sock` ' +
                 'into the container. Doesn\'t allow privileged mode, ' +
                 'capabilities or host volume mounts.',
    defaults: false,
    module: require('./features/dind')
  },

  relengAPIProxy: {
    title: 'Releng API proxy service',
    description: 'The Releng API proxy service allows tasks to talk to releng ' +
                 'api using an authorization token based on the task\'s scopes',
    defaults: false,
    module: require('./features/releng_api_proxy')
  },

  dockerSave: {
    title: 'Docker save',
    description: 'Uploads docker images as artifacts',
    defaults: false,
    module: require('./features/docker_save')
  },

  interactive: {
    title: 'Docker Exec Interactive',
    description: 'This allows you to interactively run commands inside the container ' + 
                 'and attaches you to the stdin/stdout/stderr over a websocket. ' +
                 'Can be used for SSH-like access to docker containers.',
    defaults: false,
    module: require('./features/interactive.js')
  },

  allowPtrace: {
    title: 'Allow ptrace within the container',
    description: 'This allows you to use the Linux ptrace functionality inside the ' + 
                 'container; it is otherwise disallowed by Docker\'s security policy. ',
    defaults: false,
    module: require('./features/allow_ptrace')
  }
};

// Basic sanity check for features
_.forIn(features, ({title, description, defaults, module}) => {
  assert(typeof title === 'string', "Expected title");
  assert(typeof description === 'string', "Expected description");
  assert(typeof defaults === 'boolean', "Expected a boolean default");
  assert(module instanceof Function, "Expected module to be class");
});

// Export features
module.exports = features;
