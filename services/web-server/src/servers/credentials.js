module.exports = () => async (request, response, next) => {
  if (
    (!request.credentials && !request.headers.authorization) ||
    !request.headers.authorization.startsWith('Bearer')
  ) {
    return next();
  }

  const accessToken = request.headers.authorization ? request.headers.authorization.replace('Bearer ', '') : '';

  try {
    const credentials = JSON.parse(
      Buffer.from(
        accessToken,
        'base64'
      ).toString()
    );

    Object.assign(request, { credentials, accessToken });
  } catch (e) {
    Object.assign(request, { accessToken });
  }

  return next();
};
