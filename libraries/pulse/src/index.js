const { Client } = require('./client');
const { consume } = require('./consumer');
const {
  pulseCredentials,
  connectionStringCredentials,
} = require('./credentials');
const { Exchanges } = require('./publisher');

module.exports = {
  Client,
  consume,
  pulseCredentials,
  connectionStringCredentials,
  Exchanges,
};
