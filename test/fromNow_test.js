import { expect } from 'chai';
import { fromNow } from '../src';

describe('fromNow', function() {
  it('should generate current datetime', () => {
    const date1 = new Date();
    const date2 = fromNow();

    // Allow for 10ms margin
    expect(date2.getTime())
      .to.be.closeTo(date1.getTime(), 10);
  });

  it('should generate with hour format', () => {
    const date1 = new Date();

    date1.setHours(date1.getHours() + 2);

    const date2 = fromNow('2 hours');

    // Allow for 10ms margin
    expect(date2.getTime())
      .to.be.closeTo(date1.getTime(), 10);
  });

  it('should generate with year+month format', () => {
    const day = 24 * 60 * 60 * 1000;
    const date1 = new Date(new Date().getTime() + 2 * 365 * day + 55 * 30 * day);
    const date2 = fromNow('2 years 55mo');

    // Allow for 10ms margin
    expect(date2.getTime())
      .to.be.closeTo(date1.getTime(), 10);
  });

  it('should generate with month format', () => {
    const date1 = new Date(new Date().getTime() + 240 * 30 * 24 * 60 * 60 * 1000);
    const date2 = fromNow('240 months');

    // Allow for 10ms margin
    expect(date2.getTime())
      .to.be.closeTo(date1.getTime(), 10);
  });

  it('should generate with -month format', () => {
    const date1 = new Date(new Date().getTime() - 240 * 30 * 24 * 60 * 60 * 1000);
    const date2 = fromNow('-240 months');

    // Allow for 10ms margin
    expect(date2.getTime())
      .to.be.closeTo(date1.getTime(), 10);
  });

  it('should generate from object definitions', () => {
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
      { expr: '1 year', from: '2017-01-19T16:27:20.974Z', result: '2018-01-19T16:27:20.974Z' }
    ].forEach(({ expr, from, result }) => {
      expect(fromNow(expr, new Date(from)).toJSON()).to.equal(result);
    });
  });
});
