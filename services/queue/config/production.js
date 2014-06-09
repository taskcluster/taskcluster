module.exports = {
  queue: {
    // Should be overwritten by environment variable
    publishMetaData:              'false',
    exchangePrefix:               'queue/v1/',
    tasks: {
      bucket:                     'tasks.taskcluster.net',
      publicBaseUrl:              'http://tasks.taskcluster.net'
    }
  },

  server: {
    publicUrl:                      'http://queue.taskcluster.net',
    port:                           80
  },

  database: {
    // Provided by environment variable
    connectionString:               undefined
  },


  amqp: {
    // Provided by environment variable
    url:                            undefined
  },

  // Credentials are given by environment variables
  aws: {
    accessKeyId:                    undefined,
    secretAccessKey:                undefined,
    region:                         'us-west-2'
  }
};
