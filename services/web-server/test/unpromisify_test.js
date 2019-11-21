const assert = require('assert');
const unpromisify = require('../src/utils/unpromisify');
const testing = require('taskcluster-lib-testing');

suite(testing.suiteName(), () => {

  // sleep until the next event-loop round
  const sleep = () => new Promise(resolve => setTimeout(resolve, 1));

  test('Successful callback', function(done) {
    const success = unpromisify(async (a, b) => {
      await sleep();
      return a + b;
    });
    assert.equal(success.length, 3); // a, b, done

    success(10, 20, (err, sum) => {
      if (err) {
        return done(err);
      }
      assert.equal(sum, 30);
      done();
    });
  });

  test('Successful callback returning an array', function(done) {
    const success = unpromisify(async (a, b) => {
      await sleep();
      return [a + b, a * b];
    }, {returnsArray: true});
    assert.equal(success.length, 3); // a, b, done

    success(10, 20, (err, sum, product) => {
      if (err) {
        return done(err);
      }
      assert.equal(sum, 30);
      assert.equal(product, 200);
      done();
    });
  });

  test('Unsuccessful callback', function(done) {
    const success = unpromisify(async () => {
      await sleep();
      throw new Error('uhoh');
    });
    assert.equal(success.length, 1); // done

    success((err, sum) => {
      if (!err || !err.toString().match(/uhoh/)) {
        return done(new Error('expected an error'));
      }
      done();
    });
  });
});
