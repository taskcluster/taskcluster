var debug = require('debug')('hooks:nextdate');

var days  = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Return the next date that is greater than the reference.
 *
 * The schedule.format.is an the schedule.json schema defined under schemas/. The
 * reference is used to determine the next scheduled date. If not supplied, it
 * will use the current time. If there is a failure in scheduling a date, we
 * supply new Date(0), since we only care about creating dates greater than
 * some reference.
 */
var nextDate = function(schedule, reference) {
  reference    = typeof reference !== 'undefined' ? reference : new Date();
  var next     = new Date(reference.getTime());
  let intSort  = (a, b) => { return a - b; };
  let weekSort = (a, b) => { return days.indexOf(a) - days.indexOf(b); };
  switch (schedule.format.type) {
    case 'none':
      // No scheduling to be done, return a 'null' value
      return new Date(0);
    case 'daily':
      schedule.format.timeOfDay.sort(intSort);
      // Check to see if it'll be schedule today
      for(var hour of schedule.format.timeOfDay) {
        next.setHours(hour, 0, 0);
        if (next > reference)
          return next;
      }
      // Not schedule today, get the first schedule tomorrow
      next.setDate(reference.getDate()+1);
      next.setHours(schedule.format.timeOfDay[0], 0, 0);
      return next;
    case 'weekly':
      // Weekly schedule have to be done in relative to the reference date
      schedule.format.dayOfWeek.sort(weekSort);
      schedule.format.timeOfDay.sort(intSort);
      // Is it scheduled this week?
      for (var day of schedule.format.dayOfWeek) {
        // Check hours against days later or equal in the week
        let offset = days.indexOf(day) - reference.getDay();
        if (offset < 0)
          continue;
        next.setDate(reference.getDate() + offset);
        for (var hour of schedule.format.timeOfDay) {
          next.setHours(hour, 0, 0);
          if (next > reference)
            return next;
        }
      }
      // Not schedule. this week, schedule for the first day next week
      let offset = days.indexOf(schedule.format.dayOfWeek[0]) - reference.getDay();
      next.setDate(reference.getDate() + 7 + offset)
      next.setHours(schedule.format.timeOfDay[0], 0, 0);
      return next;
    case 'monthly':
      schedule.format.dayOfMonth.sort(intSort);
      schedule.format.timeOfDay.sort(intSort);
      for (var day of schedule.format.dayOfMonth) {
        // Ignore schedule for earlier in the month or nonexistant days
        if (day < reference.getDate() ||
            day > daysInMonth(reference.getMonth(), reference.getYear()))
          continue
        next.setDate(day);
        for (var hour of schedule.format.timeOfDay) {
          next.setHours(hour, 0, 0);
          if (next > reference)
            return next;
        }
      }
      // Not scheduled this month, try rescheduling for next month. This is
      // done recursively to solve the edge cases where tasks are scheduled
      // once a month on the 31st.
      reference.setMonth(reference.getMonth()+1);
      return nextDate(schedule, reference);
  }
  // Return a value, just in case
  return new Date(0);
};

// Export function
module.exports = nextDate;

/** Calculate the number of days in a given month and year
 *
 * The Date module is 1 based, whereas all the other manipulation functions are
 * 0 based for months. Odd.
 */
function daysInMonth(month, year) {
  return new Date(year, month+1, 0).getDate();
}
