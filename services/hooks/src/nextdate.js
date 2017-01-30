var debug  = require('debug')('hooks:nextdate');
var parser = require('cron-parser');

// Far in the future, but still within Azure's range
var FUTURE = new Date(4000, 1, 1);

/** Return the next scheduled date that is greater than the reference, in UTC.
 */
var nextDate = function(schedule, reference) {
  reference    = typeof reference !== 'undefined' ? reference : new Date();

  let next;
  schedule.forEach((pattern) => {
    let interval = parser.parseExpression(pattern, {
      currentDate: reference,
      utc: true,
    });
    let n = interval.next();
    if (typeof next === 'undefined' || n < next) {
      next = n;
    }
  });

  return next || FUTURE;
};

module.exports = nextDate;
