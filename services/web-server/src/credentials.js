import fetch, { Headers } from 'node-fetch';

const cache = new Map();

export default ({ url }) => async (request, response, next) => {
  if (
    !request.user ||
    !request.headers.authorization ||
    !request.headers.authorization.startsWith('Bearer')
  ) {
    return next();
  }

  const accessToken = request.headers.authorization.replace('Bearer ', '');

  if (!cache.has(accessToken)) {
    const login = await fetch(url, {
      headers: new Headers({
        Authorization: `Bearer ${accessToken}`,
      }),
    });

    if (!login.ok) {
      return next();
    }

    cache.set(accessToken, {
      oidc: await login.json(),
      accessToken,
    });
  }

  Object.assign(request.user, cache.get(accessToken));

  return next();
};
