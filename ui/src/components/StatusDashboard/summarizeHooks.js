import format from './format';

export default hookGroups => {
  let totalGroups = 0;
  let totalHooks = 0;

  // `data` is a list of `{ hookGroupId, hooks }` built from
  // `hooks.listHookGroups` and one `hooks.listHooks` call per group.
  if (!hookGroups.error && !hookGroups.loading) {
    (hookGroups?.data || []).forEach(({ hooks }) => {
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
