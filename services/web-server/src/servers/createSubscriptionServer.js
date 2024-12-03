import { SubscriptionServer } from 'subscriptions-transport-ws';
import { execute, subscribe } from 'graphql';
import credentials from './credentials.js';
import formatError from './formatError.js';
import scopeUtils from 'taskcluster-lib-scopes';
import taskcluster from 'taskcluster-client';
import { decryptToken } from './decryptToken.js';
import { ErrorReply } from 'taskcluster-lib-api';

// TODO: Check for expiration of access token when the websocket connection is active
export default ({ cfg, server, schema, context, path }) => {

  let disconnectTimeout;
  SubscriptionServer.create(
    {
      schema,
      execute,
      subscribe,
      async onConnect(params, socket) {

        disconnectTimeout = setTimeout(() => {
          if (socket && socket.readyState !== socket.CLOSING && socket.readyState !== socket.CLOSED) {
            socket.close();
          }
        }, cfg.server.socketAliveTimeoutMilliSeconds);

        return new Promise((resolve, reject) => {
          credentials()(socket.upgradeReq, {}, async () => {
            try {

              const credentials = params?.Authorization ? decryptToken(params.Authorization) : null;

              const authClient = new taskcluster.Auth({
                rootUrl: cfg.taskcluster.rootUrl,//process.env['TASKCLUSTER_ROOT_URL'],
                credentials: credentials,
              });

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
                  }
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
        clearTimeout(disconnectTimeout);
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
