module.exports = () => (request, response, next) => {
  if (
    (!request.accessToken && !request.headers.authorization) ||
    !request.headers.authorization.startsWith('Bearer')
  ) {
    return next();
  }

  const accessToken = request.headers.authorization ? request.headers.authorization.replace('Bearer ', '') : '';

  Object.assign(request, { accessToken });

  return next();
};
