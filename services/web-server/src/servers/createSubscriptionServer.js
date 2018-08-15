import { SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import credentials from './credentials';
import formatError from './formatError';

export default ({ server, schema, context, path }) =>
  SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      onConnect(params, socket) {
        return new Promise(resolve => {
          credentials()(socket.upgradeReq, {}, resolve);
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
