module.exports = [
  {
    name: 'basicTimer',
    type: 'monitor.timer',
    level: 'info',
    version: 1,
    description: 'The most basic timer.',
    fields: {
      key: 'A key that should be unique to the logger prefix.',
      duration: 'The duration in ms of whatever was timed.',
    },
  },
];
