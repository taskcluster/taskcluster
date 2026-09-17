import format from './format';

export default provisioners => {
  let total = 0;

  // `data` is the full provisioner list from `queue.listProvisioners`.
  if (!provisioners.error && !provisioners.loading) {
    total = (provisioners?.data || []).length;
  }

  return [
    {
      title: 'Provisioners',
      value: format(total),
      link: '/provisioners',
      error: provisioners.error?.message,
      loading: provisioners.loading,
    },
  ];
};
