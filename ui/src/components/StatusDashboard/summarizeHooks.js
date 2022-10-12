import format from './format';

export default hookGroups => {
  let totalGroups = 0;
  let totalHooks = 0;

  if (!hookGroups.error && !hookGroups.loading) {
    (hookGroups?.data?.hookGroups || []).forEach(({ hooks }) => {
      totalGroups += 1;
      totalHooks += (hooks || []).length;
    });
  }

  const link = '/hooks';

  return [
    {
      title: 'Hook Groups',
      value: format(totalGroups),
      link,
      error: hookGroups.error?.message,
      loading: hookGroups.loading,
    },
    {
      title: 'Hooks',
      value: format(totalHooks),
      link,
      error: hookGroups.error?.message,
      loading: hookGroups.loading,
    },
  ];
};
