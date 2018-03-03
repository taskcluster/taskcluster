import jwt from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export default ({ jwksUri, issuer, socket, next: socketNext }) => (
  request,
  response,
  next
) => {
  if (!request) {
    request = {
      method: 'UPGRADE',
      headers: {
        ...socket.params,
        authorization: socket.params && socket.params.Authorization,
      },
    };
    response = {};
    next = () => socketNext(request);
  }

  return jwt({
    secret: expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri,
    }),
    issuer,
    algorithms: ['RS256'],
    credentialsRequired: false,
  })(request, response, next);
};
