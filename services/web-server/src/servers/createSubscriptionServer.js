import { SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import jwt from './jwt';
import credentials from './credentials';
import formatError from './formatError';

export default ({ server, schema, context, path }) =>
  SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      onConnect(params, socket) {
        // This way lies madness with Express middleware
        // and web sockets with external middleware
        return new Promise(resolve => {
          jwt({
            jwksUri: process.env.JWKS_URI,
            issuer: process.env.JWT_ISSUER,
            socket: {
              params,
              socket,
            },
            next(request) {
              credentials({
                url: process.env.LOGIN_URL,
              })(request, null, () => {
                resolve(request);
              });
            },
          })();
        });
      },
      async onOperation(message, connection) {
        // formatResponse should be replaced when
        // SubscriptionServer accepts a formatError
        // parameter for custom error formatting.
        // See https://github.com/apollographql/subscriptions-transport-ws/issues/182
        return {
          ...connection,
          formatResponse: value => ({
            ...value,
            errors: value.errors && value.errors.map(formatError),
          }),
          context: await context({ connection }),
        };
      },
    },
    {
      server,
      path,
    }
  );
