const zurvan = require('zurvan');
const timers = require('timers');

/** Return promise that is resolved in `delay` ms */
exports.sleep = function(delay) {
  return new Promise(function(accept) {
    setTimeout(accept, delay);
  });
};

exports.runWithFakeTime = (fn, {mock = true, maxTime = 30000, ...zurvanOptions} = {}) => {
  if (!mock) {
    // if not mocking, we can't use fake time as it will cause all sorts
    // of timeouts to occur immediately
    return fn;
  }
  return async function wrap() {
    await zurvan.interceptTimers({
      systemTime: new Date(),
      denyImplicitTimer: true,
      throwOnInvalidClearTimer: false, // superagent does this..
      rejectOnCallbackFailure: true,
      fakeNodeDedicatedTimers: false, // so we can call a real timers.setImmediate
      ...zurvanOptions,
    });

    let finished, err;
    fn.apply(this, []).then(
      () => {
        finished = true;
      },
      e => {
        finished = true;
        err = e;
      });

    // intermingle setImmediate calls with advanceTime calls, so that things zurvan cannot
    // successfully fake (like JS files internal to Node) get a chance to run.
    let time = maxTime;
    while (time > 0 && !finished) {
      await zurvan.advanceTime(100);
      time -= 100;
      await new Promise(resolve => timers.setImmediate(resolve));
    }

    await zurvan.releaseTimers();
    if (err) {
      throw err;
    }
    if (!finished) {
      throw new Error(`test case not finished after faked passage of ${maxTime}ms`);
    }
  };
};
