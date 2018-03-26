var taskcluster = require('taskcluster-client');

module.exports = {
  task: {
    provisionerId:  'no-provisioner',
    workerType:     'test-worker',
    schedulerId:    'my-scheduler',
    taskGroupId:    'dSlITZ4yQgmvxxAi4A8fHQ',
    scopes:         [],
    payload:        {},
    expires:        {$fromNow: '10 days'},
    deadline:       {$fromNow:  '3 days'},
    metadata:       {
      name:         'Unit testing task',
      description:  'Task created during unit tests',
      owner:        'amiyaguchi@mozilla.com',
      source:       'http://github.com/',
    },
    tags: {
      purpose:      'taskcluster-testing',
    },
  },
  metadata: {
    name:           'Unit testing hook',
    description:    'Hook created during unit tests',
    owner:          'amiyaguchi@mozilla.com',
  },
};
