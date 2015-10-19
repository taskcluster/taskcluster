var debug  = require('debug')('hooks:nextdate');
var parser = require('cron-parser');

/** Return the next scheduled date that is greater than the reference, in UTC.
 */
var nextDate = function(schedule, reference) {
  reference    = typeof reference !== 'undefined' ? reference : new Date();

  let next;
  schedule.forEach((pattern) => {
    let interval = parser.parseExpression(pattern, {
        currentDate: reference,
        utc: true
      });
    let n = interval.next();
    if (typeof next === 'undefined' || n < next) {
        next = n;
    }
  });

  // always return a date, even if it's 1970
  return next || new Date(0);
};

module.exports = nextDate;
