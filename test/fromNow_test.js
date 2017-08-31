import assert from 'assert';
import { fromNow } from '../src';

describe('fromNow', function() {
  it('should generate current datetime', () => {
    const date1 = new Date();
    const date2 = fromNow();

    // Allow for 10ms margin
    assert(Math.abs(date2.getTime() - date1.getTime()) <= 10)
  });

  it('should generate with hour format', () => {
    const date1 = new Date();

    date1.setHours(date1.getHours() + 2);

    const date2 = fromNow('2 hours');

    // Allow for 10ms margin
    assert(Math.abs(date2.getTime() - date1.getTime()) <= 10);
  });

  it('should generate with year+month format', () => {
    const day = 24 * 60 * 60 * 1000;
    const date1 = new Date(new Date().getTime() + 2 * 365 * day + 55 * 30 * day);
    const date2 = fromNow('2 years 55mo');

    // Allow for 10ms margin
    assert(Math.abs(date2.getTime() - date1.getTime()) <= 10);
  });

  it('should generate with month format', () => {
    const date1 = new Date(new Date().getTime() + 240 * 30 * 24 * 60 * 60 * 1000);
    const date2 = fromNow('240 months');

    // Allow for 10ms margin
    assert(Math.abs(date2.getTime() - date1.getTime()) <= 10);
  });

  it('should generate with -month format', () => {
    const date1 = new Date(new Date().getTime() - 240 * 30 * 24 * 60 * 60 * 1000);
    const date2 = fromNow('-240 months');

    // Allow for 10ms margin
    assert(Math.abs(date2.getTime() - date1.getTime()) <= 10);
  });
});
