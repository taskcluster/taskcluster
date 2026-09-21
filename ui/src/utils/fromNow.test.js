import fromNow from './fromNow';

describe('fromNow', () => {
  it('should default the reference to the current datetime', () => {
    const now = new Date();

    expect(fromNow().getTime()).toEqual(now.getTime());
    expect(fromNow('2 hours').getTime()).toEqual(
      now.getTime() + 2 * 60 * 60 * 1000
    );
  });

  it('should generate from object definitions', () => {
    [
      {
        expr: '1 hour',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T17:27:20.974Z',
      },
      {
        expr: '3h',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T19:27:20.974Z',
      },
      {
        expr: '1 hours',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T17:27:20.974Z',
      },
      {
        expr: '-1 hour',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T15:27:20.974Z',
      },
      {
        expr: '1 m',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:28:20.974Z',
      },
      {
        expr: '1m',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:28:20.974Z',
      },
      {
        expr: '12 min',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:39:20.974Z',
      },
      {
        expr: '12min',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:39:20.974Z',
      },
      {
        expr: '11m',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:38:20.974Z',
      },
      {
        expr: '11 m',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:38:20.974Z',
      },
      {
        expr: '1 day',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-20T16:27:20.974Z',
      },
      {
        expr: '2 days',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-21T16:27:20.974Z',
      },
      {
        expr: '1 second',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-19T16:27:21.974Z',
      },
      {
        expr: '1 week',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-01-26T16:27:20.974Z',
      },
      {
        expr: '1 month',
        from: '2017-01-19T16:27:20.974Z',
        result: '2017-02-18T16:27:20.974Z',
      },
      {
        expr: '30 mo',
        from: '2017-01-19T16:27:20.974Z',
        result: '2019-07-08T16:27:20.974Z',
      },
      {
        expr: '-30 mo',
        from: '2017-01-19T16:27:20.974Z',
        result: '2014-08-03T16:27:20.974Z',
      },
      {
        expr: '1 year',
        from: '2017-01-19T16:27:20.974Z',
        result: '2018-01-19T16:27:20.974Z',
      },
      {
        expr: '2 years 55mo',
        from: '2017-01-19T16:27:20.974Z',
        result: '2023-07-27T16:27:20.974Z',
      },
    ].forEach(({ expr, from, result }) => {
      expect(fromNow(expr, new Date(from)).toJSON()).toEqual(result);
    });
  });
});
