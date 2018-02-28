export default ({ connection, ...props }) => {
  if (!connection) {
    return props;
  }

  const limit = connection.limit
    ? connection.limit > 100 ? 100 : connection.limit
    : 100;
  const continuationToken = connection.startCursor || connection.endCursor;
  const options = continuationToken ? { limit, continuationToken } : { limit };

  return { ...props, connection, options };
};
