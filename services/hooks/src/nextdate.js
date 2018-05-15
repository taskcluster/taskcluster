const debug  = require('debug')('hooks:nextdate');
const parser = require('cron-parser');

// Far in the future, but still within Azure's range
const FUTURE = new Date(4000, 1, 1);

/** Return the next scheduled date that is greater than the reference, in UTC.
 */
const nextDate = function(schedule, reference) {
  reference    = typeof reference !== 'undefined' ? reference : new Date();

  let next;
  schedule.forEach((pattern) => {
    let interval = parser.parseExpression(pattern, {
      currentDate: reference,
      utc: true,
    });
    let n = new Date(interval.next().toString());
    if (typeof next === 'undefined' || n < next) {
      next = n;
    }
  });
  return next || FUTURE;
};

module.exports = nextDate;
