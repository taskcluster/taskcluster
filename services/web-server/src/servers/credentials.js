export default () => async (request, response, next) => {
  if (
    (!request.credentials && !request.headers.authorization) ||
    !request.headers.authorization.startsWith('Bearer')
  ) {
    return next();
  }

  const credentials = JSON.parse(
    Buffer.from(
      request.headers.authorization.replace('Bearer ', ''),
      'base64'
    ).toString()
  );

  Object.assign(request, { credentials });

  return next();
};
