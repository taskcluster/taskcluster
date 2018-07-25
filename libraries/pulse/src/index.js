const {Client, FakeClient} = require('./client');
const {consume} = require('./consumer');
const {Exchanges} = require('./publisher');

module.exports = {
  Client,
  FakeClient,
  consume,
  Exchanges,
};
