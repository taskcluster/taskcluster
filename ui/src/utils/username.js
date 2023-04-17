export default user => {
  return (
    user?.profile?.displayName || user?.profile?.username || 'unknown hero'
  );
};
