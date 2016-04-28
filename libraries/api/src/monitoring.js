let debug = require('debug')('base:api');

/**
 * Middleware that reports timings to Statsum.
 *
 * The `method` is the name of the API method, `monitor` is an instance of
 * taskcluster-lib-monitor.
 */
let createReporter = (method, monitor) => {
  return (req, res, next) => {
    let sent = false;
    let start = process.hrtime();
    let send = () => {
      try {
        // Avoid sending twice
        if (sent) {
          return;
        }
        sent = true;

        let d = process.hrtime(start);

        let success = 'success';
        if (res.statusCode >= 500) {
          success = 'server-error';
        } else if (res.statusCode >= 400) {
          success = 'client-error';
        }

        for (let stat of [success, 'all']) {
          let k = [method, stat].join('.');
          monitor.measure(k, d[0] * 1000 + (d[1] / 1000000));
          monitor.count(k);
        }
      } catch (e) {
        debug("Error while compiling response times: %s, %j", err, err, err.stack);
      }
    };
    res.once('finish', send);
    res.once('close', send);
    next();
  };
}

exports.createReporter = createReporter;
