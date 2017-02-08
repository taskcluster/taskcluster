const sinon = require('sinon');

const EXCHANGE_NAMES = [
  'pullRequest',
  'push',
  'release',
];

class FakePublisher {
  constructor() {
    EXCHANGE_NAMES.forEach(name => {
      this[name] = sinon.stub();
    });
  }

  resetStubs() {
    EXCHANGE_NAMES.forEach(name => {
      this[name].reset();
    });
  }
}

module.exports = FakePublisher;
