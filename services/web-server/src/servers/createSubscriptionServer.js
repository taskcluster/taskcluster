import { SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import credentials from './credentials.js';
import formatError from './formatError.js';
import scopeUtils from 'taskcluster-lib-scopes';
import { decryptToken } from './decryptToken.js';
import { ErrorReply } from 'taskcluster-lib-api';

export default ({ cfg, server, schema, context, path, authFactory }) => {

  const timeoutMap = new WeakMap();

  SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      async onConnect(params, socket) {

        const disconnectTimeout = setTimeout(() => {
          if (socket && socket.readyState !== socket.CLOSING && socket.readyState !== socket.CLOSED) {
            socket.close();
          }
        }, cfg.server.socketAliveTimeoutMilliSeconds);
        timeoutMap.set(socket, disconnectTimeout);

        return new Promise((resolve, reject) => {
          credentials()(socket.upgradeReq, {}, async () => {
            try {

              const credentials = params?.Authorization ? decryptToken(params.Authorization) : null;

              const authClient = authFactory({ credentials });

              const scopes = await authClient.currentScopes();
              const satisfyingScopes = scopeUtils.scopesSatisfying(scopes.scopes, { AllOf: ['web:read-pulse'] });

              if (!satisfyingScopes) {

                const message = ([
                  `Error: InsufficientScopes`,
                  '',
                  `Client ID ${credentials?.clientId ?? 'anonymous'} does not have sufficient scopes and is missing the following scopes:`,
                  '',
                  '```',
                  'web:read-pulse',
                  '```',
                ]).join('\n');

                return reject(new ErrorReply({
                  code: 'InsufficientScopes',
                  message: message,
                  details: {
                    required: ['web:read-pulse'],
                  },
                }));
              }

              resolve();
            } catch (err) {
              reject(err);
            }
          });
        });
      },
      onDisconnect(socket) {

        const timeout = timeoutMap.get(socket);
        clearTimeout(timeout);
        timeoutMap.delete(socket);
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
    },
  );
};
