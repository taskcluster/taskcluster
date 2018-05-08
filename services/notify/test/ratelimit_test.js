const _ = require('lodash');
const assert = require('assert');
const MockDate = require('mockdate');
const RateLimit = require('../src/ratelimit');
const load = require('../src/main');

suite('ratelimit_test.js', function() {
  let rateLimit;

  setup(async function() {
    rateLimit = new RateLimit({
      count: 5,
      time: 10,
      noPeriodicPurge: true,
    });

    MockDate.set('1/1/2000');
  });

  teardown(function() {
    MockDate.reset();
  });

  const timeFlies = (seconds) => {
    const newTime = new Date();
    newTime.setSeconds(newTime.getSeconds() + seconds);
    MockDate.set(newTime);
  };

  test('does not rate-limit a single send', function() {
    assert(rateLimit.remaining('foo@taskcluster.net') >= 0);
  });

  test('does rate-limit sends at higher than 5 per 10 seconds', function() {
    // send at 1 per second..
    const limited = _.range(10).map(() => {
      timeFlies(1);
      const remaining = rateLimit.remaining('foo@taskcluster.net');
      if (remaining) {
        rateLimit.markEvent('foo@taskcluster.net');
      }
      return remaining;
    });
    assert.deepEqual(limited, [
      5, 4, 3, 2, 1, // five not limited
      0, 0, 0, 0, 0, // remainder limited
    ]);
  });

  test('lifts the rate limit maxMessageTime after a message is sent', function() {
    // send 3 all at once
    _.range(3).forEach(() => {
      rateLimit.markEvent('foo@taskcluster.net');
    });
    assert.equal(rateLimit.remaining('foo@taskcluster.net'), 2);
    // 5 seconds later, another 2
    timeFlies(5);
    _.range(2).forEach(() => {
      rateLimit.markEvent('foo@taskcluster.net');
    });
    assert.equal(rateLimit.remaining('foo@taskcluster.net'), 0);
    // 7 seconds later (12 seconds from sending the first 3), we should have 3 remaining
    timeFlies(7);
    assert.equal(rateLimit.remaining('foo@taskcluster.net'), 3);
    timeFlies(7);
    assert.equal(rateLimit.remaining('foo@taskcluster.net'), 5);
  });

  test('purgeAllOldTimes purges things', function() {
    _.range(20).forEach(() => {
      rateLimit.markEvent('foo@taskcluster.net');
      rateLimit.markEvent('bar@taskcluster.net');
      timeFlies(1);
    });
    rateLimit.purgeAllOldTimes();
    assert.equal(_.keys(rateLimit.times).length, 2);
    assert.equal(rateLimit.times['foo@taskcluster.net'].length, 10);
    assert.equal(rateLimit.times['bar@taskcluster.net'].length, 10);

    timeFlies(10);
    rateLimit.purgeAllOldTimes();
    assert.equal(_.keys(rateLimit.times).length, 0); // purges empty lists
  });
});
