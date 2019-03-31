module.exports = [
  {
    name: 'basicTimer',
    title: 'Basic Timer',
    type: 'monitor.timer',
    level: 'info',
    version: 1,
    description: 'The most basic timer.',
    fields: {
      key: 'A key that should be unique to the logger prefix.',
      duration: 'The duration in ms of whatever was timed.',
    },
  },
  {
    name: 'handlerTimer',
    title: 'Handler Timer',
    type: 'monitor.timedHandler',
    level: 'info',
    version: 1,
    description: 'A basic timer applied to a function.',
    fields: {
      name: 'The name of the handler.',
      status: 'Whether or not the handler resolved succesfully.',
      duration: 'The duration in ms of the function.',
    },
  },
  {
    name: 'apiMethod',
    title: 'API Method Report',
    type: 'monitor.apiMethod',
    level: 'notice',
    version: 1,
    description: `A timer and audit for express endpoints.
                  You can combine this with auth audit logs to get
                  a complete picture of what was authorized when.

                  Here, anything that is not public should have authenticated
                  and if it authenticated, we will tell the clientId here. Given
                  that, it is not necessarily true that the endpoint was
                  _authorized_. You can tell that by the statusCode.`,
    fields: {
      name: 'The name of the endpoint.',
      resource: 'The path of the http request. Should match the one in auth audit log.',
      method: 'The http method of the request. Should match the one in auth audit log.',
      statusCode: 'The http status code that the endpoint resolved with.',
      duration: 'The duration in ms of the endpoint.',
      public: 'Will be true if the endpoint requires no scopes.',
      hasAuthed: 'Will be true if the request had req.authorize() called on it.',
      clientId: 'The clientId that made the request if there was one.',
    },
  },
  {
    name: 'awsTimer',
    title: 'AWS Request Report',
    type: 'monitor.aws',
    level: 'info',
    version: 1,
    description: 'A timer for calls to aws services.',
    fields: {
      service: 'The name of the aws service being accessed.',
      operation: 'The specific operation of this call.',
      duration: 'How long it took to resolve the request in ms.',
      region: 'The AWS region this service is in.',
    },
  },
  {
    name: 'resourceMetrics',
    title: 'Resource Usage Metrics',
    type: 'monitor.resources',
    level: 'info',
    version: 1,
    description: 'Metrics of a node process.',
    fields: {
      lastCpuUsage: 'The output of node\'s process.cpuUsage',
      lastMemoryUsage: 'The output of node\'s process.memoryUsage',
    },
  },
  {
    name: 'measureMetric',
    type: 'monitor.measure',
    title: 'Generic Measure',
    level: 'info',
    version: 1,
    description: 'A simple measurement. The reported values are expected to have statistics calculated over them.',
    fields: {
      key: 'An arbitrary key.',
      val: 'A number that should be calculated over in a time span.',
    },
  },
  {
    name: 'countMetric',
    type: 'monitor.count',
    title: 'Generic Count',
    level: 'info',
    version: 1,
    description: 'A simple count. The reported values should be summed up in a time span.',
    fields: {
      key: 'An arbitrary key.',
      val: 'A number that should be summed over a time span.',
    },
  },
  {
    name: 'errorReport',
    type: 'monitor.error',
    title: 'Error Report',
    level: 'any',
    version: 1,
    description: 'A specifically formatted error report. Will have at least the following but can contain more.',
    fields: {
      name: 'The name of the error.',
      message: 'Whatever message the error contained.',
      stack: 'A nodejs stack trace.',
    },
  },
  {
    name: 'timekeeper',
    type: 'monitor.timekeeper',
    title: 'TimeKeeper Report',
    level: 'info',
    version: 1,
    description: 'A simple timekeeper for measuring arbitrary time spans.',
    fields: {
      key: 'A key that should be unique to the logger prefix.',
      duration: 'The duration in ms of whatever was timed.',
    },
  },
  {
    name: 'generic',
    type: 'monitor.generic',
    title: 'Generic Message',
    level: 'any',
    version: 1,
    description: 'An internal type for logging simple messages. No required fields.',
    fields: {},
  },
  {
    name: 'loggingError',
    type: 'monitor.loggingError',
    title: 'Error in Logging',
    level: 'err',
    version: 1,
    description: 'An internal type for reporting malformed logging calls.',
    fields: {},
  },
];
