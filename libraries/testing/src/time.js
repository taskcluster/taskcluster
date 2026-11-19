import sinon from 'sinon';

const realSetImmediate = setImmediate;

/** Return promise that is resolved in `delay` ms */
export const sleep = delay =>
  new Promise(accept => {
    setTimeout(accept, delay);
  });

export const runWithFakeTime = (fn, { mock = true, maxTime = 30000, systemTime, ...fakeTimersOptions } = {}) => {
  if (!mock) {
    // if not mocking, we can't use fake time as it will cause all sorts
    // of timeouts to occur immediately
    return fn;
  }
  return async function wrap() {
    const clock = sinon.useFakeTimers({ now: systemTime ?? Date.now(), ...fakeTimersOptions });

    let finished, err;
    try {
      fn.apply(this, []).then(
        () => {
          finished = true;
        },
        e => {
          finished = true;
          err = e;
        }
      );

      // intermingle real setImmediate calls with clock ticks, so that real I/O
      // gets a chance to complete.
      let time = maxTime;
      while (time > 0 && !finished) {
        await clock.tickAsync(100);
        time -= 100;
        await new Promise(resolve => realSetImmediate(resolve));
      }
    } finally {
      clock.restore();
    }

    if (err) {
      throw err;
    }
    if (!finished) {
      throw new Error(`test case not finished after faked passage of ${maxTime}ms`);
    }
  };
};
