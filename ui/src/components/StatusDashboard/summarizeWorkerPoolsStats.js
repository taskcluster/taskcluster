import format from './format';

export default (wmStats, link = '/worker-manager/errors') => {
  const { data, loading, error } = wmStats;
  const stats = data?.WorkerManagerErrorsStats?.totals;
  let last24hours = 0;

  if (stats?.hourly) {
    last24hours = Object.values(stats.hourly).reduce(
      (acc, cur) => acc + cur,
      0
    );
  }

  return [
    {
      title: 'Total errors 7d',
      hint: 'Usually means last 7 days, as errors are being deleted after that',
      value: loading ? '...' : format(stats?.total || 0),
      link,
      error: error?.message,
      loading,
    },
    {
      title: 'Last 7 days',
      type: 'graph',
      value: loading ? [] : Object.values(stats?.daily || {}),
      link,
      error: error?.message,
      loading,
    },
    {
      title: 'Total errors 24h',
      value: loading ? '...' : format(last24hours),
      link,
      error: error?.message,
      loading,
    },
    {
      title: 'Last 24 hours',
      type: 'graph',
      value: loading ? [] : Object.values(stats?.hourly || {}),
      link,
      error: error?.message,
      loading,
    },
  ];
};
