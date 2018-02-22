import jwt from 'express-jwt';
import { expressJwtSecret } from 'jwks-rsa';

export default ({ jwksUri, issuer }) =>
  jwt({
    secret: expressJwtSecret({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri,
    }),
    issuer,
    algorithms: ['RS256'],
    credentialsRequired: false,
  });
