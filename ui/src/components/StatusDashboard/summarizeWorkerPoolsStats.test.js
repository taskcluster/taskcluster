import summarizeWorkerPoolStats from './summarizeWorkerPoolsStats';

describe('summarizeWorkerPoolStats ', () => {
  it('should return empty values', () => {
    const out = summarizeWorkerPoolStats({ data: {} });

    expect(out.length).toEqual(4);
    expect(out[0].value).toEqual('0');
    expect(out[1].value).toEqual([]);
    expect(out[2].value).toEqual('0');
    expect(out[3].value).toEqual([]);
  });
  it('Should populate values', () => {
    const out = summarizeWorkerPoolStats({
      data: {
        WorkerManagerErrorsStats: {
          totals: {
            total: 10,
            daily: {
              '2021-01-01': 1,
              '2021-01-02': 2,
              '2021-01-03': 3,
              '2021-01-04': 4,
              '2021-01-05': 5,
              '2021-01-06': 6,
              '2021-01-07': 7,
            },
            hourly: {
              '2021-01-07T00:00:00.000Z': 1,
              '2021-01-07T01:00:00.000Z': 2,
              '2021-01-07T02:00:00.000Z': 3,
              '2021-01-07T03:00:00.000Z': 4,
              '2021-01-07T04:00:00.000Z': 5,
            },
          },
        },
      },
    });

    expect(out.length).toEqual(4);
    expect(out[0].value).toEqual('10');
    expect(out[1].value).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(out[2].value).toEqual('15');
    expect(out[3].value).toEqual([1, 2, 3, 4, 5]);
  });
});
