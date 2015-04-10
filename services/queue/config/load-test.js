module.exports = {
  queue: {
    publishMetaData:              'false',
    claimTimeout:                 20 * 60,
    publicArtifactBucket:         'test-bucket-for-any-garbage',
    privateArtifactBucket:        'test-bucket-for-any-garbage2',
    artifactContainer:            'artifacts',
    statsComponent:               'load-test-queue',
    queuePrefix:                  'hacks',
    taskTableName:                'LoadTestTasks',
    artifactTableName:            'LoadTestArtifacts',
    claimQueue:                   'loadtest-claim-queue',
    deadlineQueue:                'loadtest-deadline-queue'
  },

  server: {
    publicUrl:                    'https://tc-queue-load-test.herokuapp.com',
    port:                         80,
    env:                          'production',
    forceSSL:                     true,
    // We trust the proxy on heroku, as the SSL end-point provided by heroku
    // is a proxy, so we have to trust it.
    trustProxy:                   true
  },

  aws: {
    region:                       'us-west-2'
  }
};
