suite('taskcluster utilities', function() {
  var taskcluster       = require('../');
  var parseTime         = require('../lib/parsetime');
  var assert            = require('assert');

  test('parseTime 1 year', function() {
    assert.equal(parseTime('1y').years, 1);
    assert.equal(parseTime('1 yr').years, 1);
    assert.equal(parseTime('1 year').years, 1);
    assert.equal(parseTime('1 years').years, 1);
    assert.equal(parseTime('1year').years, 1);
    assert.equal(parseTime('1    yr').years, 1);
    assert.equal(parseTime('  1    year   ').years, 1);
    assert.equal(parseTime('  1 years   ').years, 1);
  });

  test('parseTime -1 year', function() {
    assert.equal(parseTime('- 1y').years, -1);
    assert.equal(parseTime('- 1 yr').years, -1);
    assert.equal(parseTime('- 1 year').years, -1);
    assert.equal(parseTime('- 1 years').years, -1);
    assert.equal(parseTime('- 1year').years, -1);
    assert.equal(parseTime('- 1    yr').years, -1);
    assert.equal(parseTime('  - 1    year   ').years, -1);
    assert.equal(parseTime('  -  1 years   ').years, -1);
  });

  test('parseTime +1 year', function() {
    assert.equal(parseTime('+ 1y').years, 1);
    assert.equal(parseTime('+ 1 yr').years, 1);
    assert.equal(parseTime('+ 1 year').years, 1);
    assert.equal(parseTime('+ 1 years').years, 1);
    assert.equal(parseTime('+ 1year').years, 1);
    assert.equal(parseTime('+ 1    yr').years, 1);
    assert.equal(parseTime('  + 1    year   ').years, 1);
    assert.equal(parseTime('  +  1 years   ').years, 1);
  });

  test('parseTime 1 month', function() {
    assert.equal(parseTime('1mo').months, 1);
    assert.equal(parseTime('1 mo').months, 1);
    assert.equal(parseTime('1 month').months, 1);
    assert.equal(parseTime('1 months').months, 1);
    assert.equal(parseTime('1month').months, 1);
    assert.equal(parseTime('1    mo').months, 1);
    assert.equal(parseTime('  1    month   ').months, 1);
    assert.equal(parseTime('  1 months   ').months, 1);
  });

  test('parseTime -1 month', function() {
    assert.equal(parseTime('- 1mo').months, -1);
    assert.equal(parseTime('- 1 mo').months, -1);
    assert.equal(parseTime('- 1 month').months, -1);
    assert.equal(parseTime('- 1 months').months, -1);
    assert.equal(parseTime('- 1month').months, -1);
    assert.equal(parseTime('- 1    mo').months, -1);
    assert.equal(parseTime('  - 1    month   ').months, -1);
    assert.equal(parseTime('  - 1 months   ').months, -1);
  });

  test('parseTime 1 week', function() {
    assert.equal(parseTime('1w').weeks, 1);
    assert.equal(parseTime('1 wk').weeks, 1);
    assert.equal(parseTime('1 week').weeks, 1);
    assert.equal(parseTime('1 weeks').weeks, 1);
    assert.equal(parseTime('1week').weeks, 1);
    assert.equal(parseTime('1    wk').weeks, 1);
    assert.equal(parseTime('  1    week   ').weeks, 1);
    assert.equal(parseTime('  1 weeks   ').weeks, 1);
  });

  test('parseTime 1 day', function() {
    assert.equal(parseTime('1d').days, 1);
    assert.equal(parseTime('1 d').days, 1);
    assert.equal(parseTime('1 day').days, 1);
    assert.equal(parseTime('1 days').days, 1);
    assert.equal(parseTime('1day').days, 1);
    assert.equal(parseTime('1    d').days, 1);
    assert.equal(parseTime('  1    day   ').days, 1);
    assert.equal(parseTime('  1 days   ').days, 1);
  });

  test('parseTime 3 days', function() {
    assert.equal(parseTime('3d').days, 3);
    assert.equal(parseTime('3 d').days, 3);
    assert.equal(parseTime('3 day').days, 3);
    assert.equal(parseTime('3 days').days, 3);
    assert.equal(parseTime('3day').days, 3);
    assert.equal(parseTime('3    d').days, 3);
    assert.equal(parseTime('  3    day   ').days, 3);
    assert.equal(parseTime('  3 days   ').days, 3);
  });

  test('parseTime 45 hours', function() {
    assert.equal(parseTime('45h').hours, 45);
    assert.equal(parseTime('45 h').hours, 45);
    assert.equal(parseTime('45 hour').hours, 45);
    assert.equal(parseTime('45 hours').hours, 45);
    assert.equal(parseTime('45hours').hours, 45);
    assert.equal(parseTime('45    h').hours, 45);
    assert.equal(parseTime('  45    hour   ').hours, 45);
    assert.equal(parseTime('  45 hours   ').hours, 45);
  });

  test('parseTime 45 min', function() {
    assert.equal(parseTime('45min').minutes, 45);
    assert.equal(parseTime('45 min').minutes, 45);
    assert.equal(parseTime('45 minute').minutes, 45);
    assert.equal(parseTime('45 minutes').minutes, 45);
    assert.equal(parseTime('45minutes').minutes, 45);
    assert.equal(parseTime('45    min').minutes, 45);
    assert.equal(parseTime('  45    min   ').minutes, 45);
    assert.equal(parseTime('  45 minutes   ').minutes, 45);
  });

  test('parseTime 45 seconds', function() {
    assert.equal(parseTime('45 s').seconds, 45);
    assert.equal(parseTime('45 s').seconds, 45);
    assert.equal(parseTime('45 sec').seconds, 45);
    assert.equal(parseTime('45 second').seconds, 45);
    assert.equal(parseTime('45 seconds').seconds, 45);
    assert.equal(parseTime('45seconds').seconds, 45);
    assert.equal(parseTime('45    s').seconds, 45);
    assert.equal(parseTime('  45    sec   ').seconds, 45);
    assert.equal(parseTime('  45 seconds   ').seconds, 45);
  });

  test('parseTime 1yr2mo3w4d5h6min7s', function() {
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').years, 1);
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').months, 2);
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').weeks, 3);
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').days, 4);
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').hours, 5);
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').minutes, 6);
    assert.equal(parseTime('1yr2mo3w4d5h6min7s').seconds, 7);
    assert.equal(parseTime('2d3h').minutes, 0);
    assert.equal(parseTime('2d0h').hours, 0);
  });
  test('parseTime -1yr2mo3w4d5h6min7s', function() {
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').years, -1);
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').months, -2);
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').weeks, -3);
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').days, -4);
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').hours, -5);
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').minutes, -6);
    assert.equal(parseTime('-1yr2mo3w4d5h6min7s').seconds, -7);
    assert.equal(parseTime('-2d3h').minutes, 0);
    assert.equal(parseTime('-2d0h').hours, 0);
  });

  test('fromNow()', function() {
    var d1 = new Date();
    var d2 = taskcluster.fromNow();

    // Allow for 10 ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(2 hours)', function() {
    var d1 = new Date();
    d1.setHours(d1.getHours() + 2)
    var d2 = taskcluster.fromNow('2 hours');

    // Allow for 10 ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(2 years 15 months)', function() {
    var d1 = new Date();
    d1.setMonth(d1.getMonth() + 12 * 2 + 15)
    var d2 = taskcluster.fromNow('2 years 15mo');

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(2 years 55 months)', function() {
    var d1 = new Date();
    d1.setMonth(d1.getMonth() + 12 * 2 + 55)
    var d2 = taskcluster.fromNow('2 years 55mo');

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(240 months)', function() {
    var d1 = new Date();
    d1.setFullYear(d1.getFullYear() + 20)
    var d2 = taskcluster.fromNow('240 months');

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(-240 months)', function() {
    var d1 = new Date();
    d1.setFullYear(d1.getFullYear() - 20)
    var d2 = taskcluster.fromNow('-240 months');

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });

  test('fromNow(20 years)', function() {
    var d1 = new Date();
    d1.setFullYear(d1.getFullYear() + 20)
    var d2 = taskcluster.fromNow('20 years');

    // Allow for 10ms margin
    assert(Math.abs(d2.getTime() - d1.getTime()) <= 10);
  });
});
