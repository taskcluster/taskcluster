import { decryptToken } from "./decryptToken.js";

export default () => async (request, response, next) => {
  if (
    (!request.credentials && !request.headers.authorization) ||
    !request.headers.authorization.startsWith('Bearer')
  ) {
    return next();
  }

  const credentials = decryptToken(request.headers.authorization);

  Object.assign(request, { credentials });

  return next();
};
