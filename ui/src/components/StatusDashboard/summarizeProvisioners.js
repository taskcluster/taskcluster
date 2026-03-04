import format from './format';

export default provisioners => {
  let total = 0;

  if (!provisioners.error && !provisioners.loading) {
    total = (provisioners?.data?.provisioners?.edges || []).length;
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
