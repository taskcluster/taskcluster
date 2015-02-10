suite('taskcluster.utils', function() {
  var taskcluster       = require('../');
  var assert            = require('assert');

  test('parseTime 1 year', function() {
    assert.equal(taskcluster.utils.parseTime('1y').years, 1);
    assert.equal(taskcluster.utils.parseTime('1 yr').years, 1);
    assert.equal(taskcluster.utils.parseTime('1 year').years, 1);
    assert.equal(taskcluster.utils.parseTime('1 years').years, 1);
    assert.equal(taskcluster.utils.parseTime('1year').years, 1);
    assert.equal(taskcluster.utils.parseTime('1    yr').years, 1);
    assert.equal(taskcluster.utils.parseTime('  1    year   ').years, 1);
    assert.equal(taskcluster.utils.parseTime('  1 years   ').years, 1);
  });

  test('parseTime -1 year', function() {
    assert.equal(taskcluster.utils.parseTime('- 1y').years, -1);
    assert.equal(taskcluster.utils.parseTime('- 1 yr').years, -1);
    assert.equal(taskcluster.utils.parseTime('- 1 year').years, -1);
    assert.equal(taskcluster.utils.parseTime('- 1 years').years, -1);
    assert.equal(taskcluster.utils.parseTime('- 1year').years, -1);
    assert.equal(taskcluster.utils.parseTime('- 1    yr').years, -1);
    assert.equal(taskcluster.utils.parseTime('  - 1    year   ').years, -1);
    assert.equal(taskcluster.utils.parseTime('  -  1 years   ').years, -1);
  });

  test('parseTime +1 year', function() {
    assert.equal(taskcluster.utils.parseTime('+ 1y').years, 1);
    assert.equal(taskcluster.utils.parseTime('+ 1 yr').years, 1);
    assert.equal(taskcluster.utils.parseTime('+ 1 year').years, 1);
    assert.equal(taskcluster.utils.parseTime('+ 1 years').years, 1);
    assert.equal(taskcluster.utils.parseTime('+ 1year').years, 1);
    assert.equal(taskcluster.utils.parseTime('+ 1    yr').years, 1);
    assert.equal(taskcluster.utils.parseTime('  + 1    year   ').years, 1);
    assert.equal(taskcluster.utils.parseTime('  +  1 years   ').years, 1);
  });

  test('parseTime 1 month', function() {
    assert.equal(taskcluster.utils.parseTime('1mo').months, 1);
    assert.equal(taskcluster.utils.parseTime('1 mo').months, 1);
    assert.equal(taskcluster.utils.parseTime('1 month').months, 1);
    assert.equal(taskcluster.utils.parseTime('1 months').months, 1);
    assert.equal(taskcluster.utils.parseTime('1month').months, 1);
    assert.equal(taskcluster.utils.parseTime('1    mo').months, 1);
    assert.equal(taskcluster.utils.parseTime('  1    month   ').months, 1);
    assert.equal(taskcluster.utils.parseTime('  1 months   ').months, 1);
  });

  test('parseTime -1 month', function() {
    assert.equal(taskcluster.utils.parseTime('- 1mo').months, -1);
    assert.equal(taskcluster.utils.parseTime('- 1 mo').months, -1);
    assert.equal(taskcluster.utils.parseTime('- 1 month').months, -1);
    assert.equal(taskcluster.utils.parseTime('- 1 months').months, -1);
    assert.equal(taskcluster.utils.parseTime('- 1month').months, -1);
    assert.equal(taskcluster.utils.parseTime('- 1    mo').months, -1);
    assert.equal(taskcluster.utils.parseTime('  - 1    month   ').months, -1);
    assert.equal(taskcluster.utils.parseTime('  - 1 months   ').months, -1);
  });

  test('parseTime 1 week', function() {
    assert.equal(taskcluster.utils.parseTime('1w').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('1 wk').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('1 week').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('1 weeks').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('1week').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('1    wk').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('  1    week   ').weeks, 1);
    assert.equal(taskcluster.utils.parseTime('  1 weeks   ').weeks, 1);
  });

  test('parseTime 1 day', function() {
    assert.equal(taskcluster.utils.parseTime('1d').days, 1);
    assert.equal(taskcluster.utils.parseTime('1 d').days, 1);
    assert.equal(taskcluster.utils.parseTime('1 day').days, 1);
    assert.equal(taskcluster.utils.parseTime('1 days').days, 1);
    assert.equal(taskcluster.utils.parseTime('1day').days, 1);
    assert.equal(taskcluster.utils.parseTime('1    d').days, 1);
    assert.equal(taskcluster.utils.parseTime('  1    day   ').days, 1);
    assert.equal(taskcluster.utils.parseTime('  1 days   ').days, 1);
  });

  test('parseTime 3 days', function() {
    assert.equal(taskcluster.utils.parseTime('3d').days, 3);
    assert.equal(taskcluster.utils.parseTime('3 d').days, 3);
    assert.equal(taskcluster.utils.parseTime('3 day').days, 3);
    assert.equal(taskcluster.utils.parseTime('3 days').days, 3);
    assert.equal(taskcluster.utils.parseTime('3day').days, 3);
    assert.equal(taskcluster.utils.parseTime('3    d').days, 3);
    assert.equal(taskcluster.utils.parseTime('  3    day   ').days, 3);
    assert.equal(taskcluster.utils.parseTime('  3 days   ').days, 3);
  });

  test('parseTime 45 hours', function() {
    assert.equal(taskcluster.utils.parseTime('45h').hours, 45);
    assert.equal(taskcluster.utils.parseTime('45 h').hours, 45);
    assert.equal(taskcluster.utils.parseTime('45 hour').hours, 45);
    assert.equal(taskcluster.utils.parseTime('45 hours').hours, 45);
    assert.equal(taskcluster.utils.parseTime('45hours').hours, 45);
    assert.equal(taskcluster.utils.parseTime('45    h').hours, 45);
    assert.equal(taskcluster.utils.parseTime('  45    hour   ').hours, 45);
    assert.equal(taskcluster.utils.parseTime('  45 hours   ').hours, 45);
  });

  test('parseTime 45 min', function() {
    assert.equal(taskcluster.utils.parseTime('45m').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('45 m').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('45 min').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('45 minute').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('45 minutes').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('45minutes').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('45    m').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('  45    min   ').minutes, 45);
    assert.equal(taskcluster.utils.parseTime('  45 minutes   ').minutes, 45);
  });

  test('parseTime 45 seconds', function() {
    assert.equal(taskcluster.utils.parseTime('45 s').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('45 s').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('45 sec').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('45 second').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('45 seconds').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('45seconds').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('45    s').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('  45    sec   ').seconds, 45);
    assert.equal(taskcluster.utils.parseTime('  45 seconds   ').seconds, 45);
  });

  test('parseTime 1yr2mo3w4d5h6m7s', function() {
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').years, 1);
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').months, 2);
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').weeks, 3);
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').days, 4);
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').hours, 5);
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').minutes, 6);
    assert.equal(taskcluster.utils.parseTime('1yr2mo3w4d5h6m7s').seconds, 7);
    assert.equal(taskcluster.utils.parseTime('2d3h').minutes, 0);
    assert.equal(taskcluster.utils.parseTime('2d0h').hours, 0);
  });
  test('parseTime -1yr2mo3w4d5h6m7s', function() {
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').years, -1);
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').months, -2);
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').weeks, -3);
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').days, -4);
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').hours, -5);
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').minutes, -6);
    assert.equal(taskcluster.utils.parseTime('-1yr2mo3w4d5h6m7s').seconds, -7);
    assert.equal(taskcluster.utils.parseTime('-2d3h').minutes, 0);
    assert.equal(taskcluster.utils.parseTime('-2d0h').hours, 0);
  });

  test('relativeTime', function() {
    var d1 = new Date();
    var d2 = new Date(d1.getTime());
    d2.setHours(d1.getHours() + 2);
    var d3 = taskcluster.utils.relativeTime(
      taskcluster.utils.parseTime('2 hours'),
      d1
    );
    assert(d3.getTime() === d2.getTime(), "Wrong date");
  });

  test('fromNow()', function() {
    var d1 = new Date();
    var ts = taskcluster.utils.fromNow();
    var d2 = new Date(ts);

    // Allow for 10 ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(2 hours)', function() {
    var d1 = new Date();
    d1.setHours(d1.getHours() + 2)
    var ts = taskcluster.utils.fromNow('2 hours');
    var d2 = new Date(ts);

    // Allow for 10 ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(2 years 15 months)', function() {
    var d1 = new Date();
    d1.setMonth(d1.getMonth() + 12 * 2 + 15)
    var ts = taskcluster.utils.fromNow('2 years 15mo');
    var d2 = new Date(ts);

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(2 years 55 months)', function() {
    var d1 = new Date();
    d1.setMonth(d1.getMonth() + 12 * 2 + 55)
    var ts = taskcluster.utils.fromNow('2 years 55mo');
    var d2 = new Date(ts);

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(240 months)', function() {
    var d1 = new Date();
    d1.setFullYear(d1.getFullYear() + 20)
    var ts = taskcluster.utils.fromNow('240 months');
    var d2 = new Date(ts);

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(-240 months)', function() {
    var d1 = new Date();
    d1.setFullYear(d1.getFullYear() - 20)
    var ts = taskcluster.utils.fromNow('-240 months');
    var d2 = new Date(ts);

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(20 years)', function() {
    var d1 = new Date();
    d1.setFullYear(d1.getFullYear() + 20)
    var ts = taskcluster.utils.fromNow('20 years');
    var d2 = new Date(ts);

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });
});
