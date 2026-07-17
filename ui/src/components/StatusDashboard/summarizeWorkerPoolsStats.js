import format from './format';

export default (
  wmStats,
  link = '/worker-manager/errors',
  customRange = false
) => {
  const { data, loading, error } = wmStats;
  const stats = data?.WorkerManagerErrorsStats?.totals;
  let hourlyTotal = 0;

  if (stats?.hourly) {
    hourlyTotal = Object.values(stats.hourly).reduce(
      (acc, cur) => acc + cur,
      0
    );
  }

  const dailyLabel = customRange ? 'Selected range (daily)' : 'Last 7 days';
  const hourlyLabel = customRange ? 'Selected range (hourly)' : 'Last 24 hours';
  const totalHint = customRange
    ? 'Sum of errors over the selected daily range'
    : 'Usually means last 7 days, as errors are being deleted after that';

  return [
    {
      title: customRange ? 'Total errors (range)' : 'Total errors 7d',
      hint: totalHint,
      value: loading ? '...' : format(stats?.total || 0),
      link,
      error: error?.message,
      loading,
    },
    {
      title: dailyLabel,
      type: 'graph',
      value: loading ? [] : Object.values(stats?.daily || {}),
      link,
      error: error?.message,
      loading,
    },
    {
      title: customRange ? 'Total errors (hourly range)' : 'Total errors 24h',
      value: loading ? '...' : format(hourlyTotal),
      link,
      error: error?.message,
      loading,
    },
    {
      title: hourlyLabel,
      type: 'graph',
      value: loading ? [] : Object.values(stats?.hourly || {}),
      link,
      error: error?.message,
      loading,
    },
  ];
};
