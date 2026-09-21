import taskcluster from '../src/index.js';
import parseTime from '../src/parsetime.js';
import assert from 'node:assert';
import testing from './helper.js';

suite(testing.suiteName(), () => {
  test('parseTime 1 year', () => {
    assert.equal(parseTime('1y').years, 1);
    assert.equal(parseTime('1 yr').years, 1);
    assert.equal(parseTime('1 year').years, 1);
    assert.equal(parseTime('1 years').years, 1);
    assert.equal(parseTime('1year').years, 1);
    assert.equal(parseTime('1    yr').years, 1);
    assert.equal(parseTime('  1    year   ').years, 1);
    assert.equal(parseTime('  1 years   ').years, 1);
  });

  test('parseTime -1 year', () => {
    assert.equal(parseTime('- 1y').years, -1);
    assert.equal(parseTime('- 1 yr').years, -1);
    assert.equal(parseTime('- 1 year').years, -1);
    assert.equal(parseTime('- 1 years').years, -1);
    assert.equal(parseTime('- 1year').years, -1);
    assert.equal(parseTime('- 1    yr').years, -1);
    assert.equal(parseTime('  - 1    year   ').years, -1);
    assert.equal(parseTime('  -  1 years   ').years, -1);
  });

  test('parseTime +1 year', () => {
    assert.equal(parseTime('+ 1y').years, 1);
    assert.equal(parseTime('+ 1 yr').years, 1);
    assert.equal(parseTime('+ 1 year').years, 1);
    assert.equal(parseTime('+ 1 years').years, 1);
    assert.equal(parseTime('+ 1year').years, 1);
    assert.equal(parseTime('+ 1    yr').years, 1);
    assert.equal(parseTime('  + 1    year   ').years, 1);
    assert.equal(parseTime('  +  1 years   ').years, 1);
  });

  test('parseTime 1 month', () => {
    assert.equal(parseTime('1mo').months, 1);
    assert.equal(parseTime('1 mo').months, 1);
    assert.equal(parseTime('1 month').months, 1);
    assert.equal(parseTime('1 months').months, 1);
    assert.equal(parseTime('1month').months, 1);
    assert.equal(parseTime('1    mo').months, 1);
    assert.equal(parseTime('  1    month   ').months, 1);
    assert.equal(parseTime('  1 months   ').months, 1);
  });

  test('parseTime -1 month', () => {
    assert.equal(parseTime('- 1mo').months, -1);
    assert.equal(parseTime('- 1 mo').months, -1);
    assert.equal(parseTime('- 1 month').months, -1);
    assert.equal(parseTime('- 1 months').months, -1);
    assert.equal(parseTime('- 1month').months, -1);
    assert.equal(parseTime('- 1    mo').months, -1);
    assert.equal(parseTime('  - 1    month   ').months, -1);
    assert.equal(parseTime('  - 1 months   ').months, -1);
  });

  test('parseTime 1 week', () => {
    assert.equal(parseTime('1w').weeks, 1);
    assert.equal(parseTime('1 wk').weeks, 1);
    assert.equal(parseTime('1 week').weeks, 1);
    assert.equal(parseTime('1 weeks').weeks, 1);
    assert.equal(parseTime('1week').weeks, 1);
    assert.equal(parseTime('1    wk').weeks, 1);
    assert.equal(parseTime('  1    week   ').weeks, 1);
    assert.equal(parseTime('  1 weeks   ').weeks, 1);
  });

  test('parseTime 1 day', () => {
    assert.equal(parseTime('1d').days, 1);
    assert.equal(parseTime('1 d').days, 1);
    assert.equal(parseTime('1 day').days, 1);
    assert.equal(parseTime('1 days').days, 1);
    assert.equal(parseTime('1day').days, 1);
    assert.equal(parseTime('1    d').days, 1);
    assert.equal(parseTime('  1    day   ').days, 1);
    assert.equal(parseTime('  1 days   ').days, 1);
  });

  test('parseTime 3 days', () => {
    assert.equal(parseTime('3d').days, 3);
    assert.equal(parseTime('3 d').days, 3);
    assert.equal(parseTime('3 day').days, 3);
    assert.equal(parseTime('3 days').days, 3);
    assert.equal(parseTime('3day').days, 3);
    assert.equal(parseTime('3    d').days, 3);
    assert.equal(parseTime('  3    day   ').days, 3);
    assert.equal(parseTime('  3 days   ').days, 3);
  });

  test('parseTime 45 hours', () => {
    assert.equal(parseTime('45h').hours, 45);
    assert.equal(parseTime('45 h').hours, 45);
    assert.equal(parseTime('45 hour').hours, 45);
    assert.equal(parseTime('45 hours').hours, 45);
    assert.equal(parseTime('45hours').hours, 45);
    assert.equal(parseTime('45    h').hours, 45);
    assert.equal(parseTime('  45    hour   ').hours, 45);
    assert.equal(parseTime('  45 hours   ').hours, 45);
  });

  test('parseTime 45 min', () => {
    assert.equal(parseTime('45min').minutes, 45);
    assert.equal(parseTime('45 min').minutes, 45);
    assert.equal(parseTime('45 minute').minutes, 45);
    assert.equal(parseTime('45 minutes').minutes, 45);
    assert.equal(parseTime('45minutes').minutes, 45);
    assert.equal(parseTime('45m').minutes, 45);
    assert.equal(parseTime('45    min').minutes, 45);
    assert.equal(parseTime('  45    min   ').minutes, 45);
    assert.equal(parseTime('  45 minutes   ').minutes, 45);
  });

  test('parseTime 45 seconds', () => {
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

  test('parseTime 1yr2mo3w4d5h6min7s', () => {
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
  test('parseTime -1yr2mo3w4d5h6min7s', () => {
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

  test('fromNow() defaults the reference to the current datetime', () => {
    const twoHours = 2 * 60 * 60 * 1000;
    const before = Date.now();
    const d1 = taskcluster.fromNow();
    const d2 = taskcluster.fromNow('2 hours');
    const after = Date.now();

    assert(d1.getTime() >= before && d1.getTime() <= after);
    assert(d2.getTime() >= before + twoHours && d2.getTime() <= after + twoHours);
  });

  suite('fromNow .. from', () => {
    [
      { expr: '1 hour', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T17:27:20.974Z' },
      { expr: '3h', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T19:27:20.974Z' },
      { expr: '1 hours', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T17:27:20.974Z' },
      { expr: '-1 hour', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T15:27:20.974Z' },
      { expr: '1 m', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:28:20.974Z' },
      { expr: '1m', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:28:20.974Z' },
      { expr: '12 min', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:39:20.974Z' },
      { expr: '12min', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:39:20.974Z' },
      { expr: '11m', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:38:20.974Z' },
      { expr: '11 m', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:38:20.974Z' },
      { expr: '1 day', from: '2017-01-19T16:27:20.974Z', result: '2017-01-20T16:27:20.974Z' },
      { expr: '2 days', from: '2017-01-19T16:27:20.974Z', result: '2017-01-21T16:27:20.974Z' },
      { expr: '1 second', from: '2017-01-19T16:27:20.974Z', result: '2017-01-19T16:27:21.974Z' },
      { expr: '1 week', from: '2017-01-19T16:27:20.974Z', result: '2017-01-26T16:27:20.974Z' },
      { expr: '1 month', from: '2017-01-19T16:27:20.974Z', result: '2017-02-18T16:27:20.974Z' },
      { expr: '30 mo', from: '2017-01-19T16:27:20.974Z', result: '2019-07-08T16:27:20.974Z' },
      { expr: '-30 mo', from: '2017-01-19T16:27:20.974Z', result: '2014-08-03T16:27:20.974Z' },
      { expr: '1 year', from: '2017-01-19T16:27:20.974Z', result: '2018-01-19T16:27:20.974Z' },
      { expr: '2 years 55mo', from: '2017-01-19T16:27:20.974Z', result: '2023-07-27T16:27:20.974Z' },
    ].forEach(({ expr, from, result }) => {
      test(expr, () => {
        assert.equal(taskcluster.fromNow(expr, new Date(from)).toJSON(), result);
      });
    });
  });
});
