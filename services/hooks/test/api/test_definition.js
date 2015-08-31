var taskcluster = require('taskcluster-client');

module.exports = {
  task: {
    provisionerId:  'no-provisioner',
    workerType:     'test-worker',
    schedulerId:    'my-scheduler',
    taskGroupId:    'dSlITZ4yQgmvxxAi4A8fHQ',
    created:        taskcluster.fromNowJSON(),
    deadline:       taskcluster.fromNowJSON('3 days'),
    expires:        taskcluster.fromNowJSON('10 days'),
    scopes:         [],
    payload:        {},
    metadata:       {
      name:         'Unit testing task',
      description:  'Task created during unit tests',
      owner:        'amiyaguchi@mozilla.com',
      source:       'http://github.com/'
    },
    tags: {
      purpose:      'taskcluster-testing'
    },
  },
  expires:          '10 days',
  deadline:         '3 days',
  metadata: {
    name:           'Unit testing hook',
    description:    'Hook created during unit tests',
    owner:          'amiyaguchi@mozilla.com'
  }
};
