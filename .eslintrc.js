const { Neutrino } = require('neutrino');

module.exports = Neutrino({ root: __dirname })
  .use('.neutrinorc')
  .call('eslintrc');
