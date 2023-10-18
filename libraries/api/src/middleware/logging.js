import { MonitorManager } from 'taskcluster-lib-monitor';
import { hrtime } from 'process';

MonitorManager.register({
  name: 'apiMethod',
  title: 'API Method Report',
  type: 'monitor.apiMethod', // `monitor.` prefix is for historical purposes
  level: 'notice',
  version: 2,
  // NOTE: these log entries are generated by tc-lib-api
  description: `A timer and audit for express API endpoints.
                You can combine this with auth audit logs to get
                a complete picture of what was authorized when.

                Here, anything that is not public should have authenticated
                and if it authenticated, we will tell the clientId here. Given
                that, it is not necessarily true that the endpoint was
                _authorized_. You can tell that by the statusCode.`,
  fields: {
    name: 'The name of the API method',
    apiVersion: 'The version of the API (e.g., `v1`)',
    resource: 'The path of the http request.',
    query: 'Query params that were passed to the request (only ones that are specified as possible in the entry)',
    method: 'The http method of the request.',
    statusCode: 'The http status code that the endpoint resolved with.',
    duration: 'The duration in ms of the call.',
    public: 'True if the endpoint requires no scopes.',
    clientId: 'The clientId that made the request, if there was one.',
    expires: 'The expiration date of the credentials, if the header was authenticated.',
    sourceIp: 'The API method caller\'s IP',
    satisfyingScopes: `The set of scopes posessed by the caller that were
                       used to authorize this request, or [] if scopes were not required.

                       This set of scopes is intuitively the scopes the caller used to
                       authorize the call.  More precisely, it is the minimal subset of the supplied
                       scopes required to satisfy the API method's authorization requirements.
                       But is not quite minimal in one sense: If several alternatives of an
                       \`AnyOf\` in the API method's scope ression are satisfied, then the
                       scopes used to satisfy *all* such alternatives are included.
    `,
    authenticated: `Will be \`true\` if the request has successfully authenticated (\`auth-success\` or \`no-auth\`) but
                    \`false\` if req.authenticate() has not been called (for example when no scopes are required), or
                    if the request has invalid credentials (\`auth-failed\`). It does *not* imply
                    authorization (i.e. scope satisfaction not guaranteed).`,
  },
});

/**
 * Log an API request on completion, including information determined
 * by the `remoteAuthentication` middleware, if present.
 */
export const logRequest = ({ builder, entry }) => {
  return (req, res, next) => {
    let sent = false;
    const start = hrtime.bigint();
    const send = async () => {
      // Avoid sending twice
      if (sent) {
        return;
      }
      sent = true;

      // This will record the values of any query params
      // passed in that we requested. Note that bewit is not
      // included here because it is not specified in entries
      // directly.
      const query = {};
      if (entry.query) {
        Object.keys(entry.query).forEach(k => {
          query[k] = req.query[k];
        });
      }
      if (req.query['bewit']) {
        query['bewit'] = '...';
      }

      const end = hrtime.bigint();

      req.tcContext.monitor.log.apiMethod({
        name: entry.name,
        apiVersion: builder.apiVersion,
        public: req.public,
        authenticated: req.authenticated,
        resource: req.path,
        query,
        method: req.method,
        // These two fields will only be populated when the request
        // is authenticated. This means that even if a request
        // has some sort of header or bewit, this will be blank
        // if the endpoint has `null` for scopes. This includes
        // cases where a scope expression evaluates to `null`.
        clientId: req.authenticated ? await req.clientId() : '',
        expires: req.authenticated ? await req.expires() : '',
        sourceIp: req.ip,
        satisfyingScopes: req.satisfyingScopes ? req.satisfyingScopes : [],
        statusCode: res.statusCode,
        duration: Number(end - start) / 1e6, // in ms
      });
    };
    res.once('finish', send);
    res.once('close', send);
    next();
  };
};
