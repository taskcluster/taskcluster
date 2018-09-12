const hawk = require('hawk');
const assert = require('assert');
const scopes = require('taskcluster-lib-scopes');
const crypto = require('crypto');
const utils = require('../utils');
const ScopeExpressionTemplate = require('../expressions');
const Debug = require('debug');

/* In production, log authorizations so they are included in papertrail regardless of
 * DEBUG settings; otherwise, log with debug
 */
const authLog = process.env.NODE_ENV === 'production' ?
  (...args) => console.log(...args) :
  Debug('api.authz');

/**
 * Authenticate client using remote API end-point and validate that it satisfies
 * a specified scope expression.
 *
 * options:
 * {
 *    signatureValidator:   async (data) => {message}, {scheme, scopes}, or
 *                                          {scheme, scopes, hash}
 *    entry: // the declared entity
 * },
 *
 * where `data` is the form: {method, url, host, port, authorization}.
 *
 * entry:
 * {
 *   scopes:  {AnyOf: [
 *     'service:method:action:<resource>'
 *     {AllOf: ['admin', 'superuser']},
 *   ]},
 *   name:        '...', // API end-point name for internal errors
 * }
 *
 * Check that the client is authenticated and has scope patterns that satisfies
 * either `'service:method:action:<resource>'` or both `'admin'` and
 * `'superuser'`. If the client has pattern "service:*" this will match any
 * scope that starts with "service:" as is the case in the example above.
 *
 * The request grows the following properties:
 *
 *  * `req.authorize(params, options)`
 *  * `await req.scopes()`
 *  * `await req.clientId()`
 *
 * The `req.authorize(params, options)` method will substitute params
 * into the scope expression in `options.scopes`. This can happen in one of three
 * ways:
 *
 * First is that any strings with `<foo>` in them will have `<foo>` replaced
 * by whatever parameter you pass in to authorize that has the key `foo`. It
 * must be a string to be substituted in this manner.
 *
 * Second is a case where an object of the form
 * `{for: 'foo', in: 'bar', each: 'baz:<foo>'}`. In this case, the param
 * `bar` must be an array and each element of `bar` will be substituted
 * into the string in `each` in the same way as described above for regular
 * strings. The results will then be concatenated into the array that this
 * object is a part of. An example:
 *
 * options.scopes = {AnyOf: ['abc', {for: 'foo', in: 'bar', each: '<foo>:baz'}]}
 *
 * params = {bar: ['def', 'qed']}
 *
 * results in:
 *
 * {AnyOf: [
 *   'abc',
 *   'def:baz',
 *   'qed:baz',
 * ]}
 *
 * Third is an object of the form `{if: 'foo', then: ...}`.
 * In this case if the parameter `foo` is a boolean and true, then the
 * object will be substituted with the scope expression specified
 * in `then`. No truthiness conversions will be done for you.
 * This is useful for allowing methods to be called
 * when certain cases happen such as an artifact beginning with the
 * string "public/".
 *
 * Params specified in `<...>` or the `in` part of the objects are allowed to
 * use dotted syntax to descend into params. Example:
 *
 * options.scopes = {AllOf: ['whatever:<foo.bar>]}
 *
 * params = {foo: {bar: 'abc'}}
 *
 * results in:
 *
 * {AllOf: ['whatever:abc']}
 *
 * The `req.authorize(params, options)` method returns `true` if the
 * client satisfies the scope expression in `options.scopes` after the
 * parameters denoted by `<...>` and `{for: ..., each: ..., in: ...}` are
 * substituted in. If the client does not satisfy the scope expression, it
 * throws an Error with code = 'AuthorizationError'.
 *
 * The `req.scopes()` method returns a Promise for the set of scopes the caller
 * has. Please, note that `req.scopes()` returns `[]` if there was an
 * authentication error.
 *
 * The `req.clientId` function returns (via Promise) the requesting clientId,
 * or the reason no clientId is known (`auth-failed:status`).  This value can
 * be used for logging and auditing, but should **never** be used for access
 * control.
 *
 * If authentication was successful, `req.expires()` returns (via Promise) the
 * expiration time of the credentials used to make this request.  If the
 * response includes some additional security token, its duration should be
 * limited to this expiration time.
 *
 * Reports 401 if authentication fails.
 */
const remoteAuthentication = ({signatureValidator, entry}) => {
  assert(signatureValidator instanceof Function,
    'Expected signatureValidator to be a function!');

  // Returns promise for object on the form:
  //   {status, message, scopes, scheme, hash}
  // scopes, scheme, hash are only present if status isn't auth-failed
  const authenticate = async (req) => {
    // Check that we're not using two authentication schemes, we could
    // technically allow two. There are cases where we redirect and it would be
    // smart to let bewit overwrite header authentication.
    // But neither Azure or AWS tolerates two authentication schemes,
    // so this is probably a fair policy for now. We can always allow more.
    if (req.headers && req.headers.authorization &&
        req.query && req.query.bewit) {
      return Promise.resolve({
        status:   'auth-failed',
        message:  'Cannot use two authentication schemes at once ' +
                  'this request has both bewit in querystring and ' +
                  'and \'authorization\' header',
      });
    }

    // If no authentication is provided, we just return valid with zero scopes
    if ((!req.query || !req.query.bewit) &&
        (!req.headers || !req.headers.authorization)) {
      return Promise.resolve({
        status: 'no-auth',
        scheme: 'none',
        scopes: [],
      });
    }

    // Parse host header
    const host = hawk.utils.parseHost(req);
    // Find port, overwrite if forwarded by reverse proxy
    let port = host.port;
    if (req.headers['x-forwarded-port'] !== undefined) {
      port = parseInt(req.headers['x-forwarded-port'], 10);
    } else if (req.headers['x-forwarded-proto'] !== undefined) {
      port = req.headers['x-forwarded-proto'] === 'https' ? 443 : port;
    }

    // Send input to signatureValidator (auth server or local validator)
    const result = await Promise.resolve(signatureValidator({
      method:           req.method.toLowerCase(),
      resource:         req.originalUrl,
      host:             host.name,
      port:             parseInt(port, 10),
      authorization:    req.headers.authorization,
      sourceIp:         req.ip,
    }));

    // Validate request hash if one is provided
    if (typeof result.hash === 'string' && result.scheme === 'hawk') {
      const hash = hawk.crypto.calculatePayloadHash(
        new Buffer(req.text, 'utf-8'),
        'sha256',
        req.headers['content-type']
      );
      if (!crypto.timingSafeEqual(Buffer.from(result.hash), Buffer.from(hash))) {
        // create a fake auth-failed result with the failed hash
        result = {
          status: 'auth-failed',
          message:
            'Invalid payload hash: {{hash}}\n' +
            'Computed payload hash: {{computedHash}}\n' +
            'This happens when your request carries a signed hash of the ' +
            'payload and the hash doesn\'t match the hash we\'ve computed ' +
            'on the server-side.',
          computedHash: hash,
        };
      }
    }

    return result;
  };

  // Compile the scopeTemplate
  let scopeTemplate;
  let useUrlParams = false;
  if (entry.scopes) {
    scopeTemplate = new ScopeExpressionTemplate(entry.scopes);
    // Write route parameters into {[param]: ''}
    // if these are valid parameters, then we can parameterize using req.params
    let [, params] = utils.cleanRouteAndParams(entry.route);
    params = Object.assign({}, ...params.map(p => ({[p]: ''})));
    useUrlParams = scopeTemplate.validate(params);
  }

  return async (req, res, next) => {
    let result;
    try {
      /** Create method that returns list of scopes the caller has */
      req.scopes = async () => {
        result = await (result || authenticate(req));
        if (result.status !== 'auth-success') {
          return Promise.resolve([]);
        }
        return Promise.resolve(result.scopes || []);
      };

      req.clientId = async () => {
        result = await (result || authenticate(req));
        if (result.status === 'auth-success') {
          return result.clientId || 'unknown-clientId';
        }
        return 'auth-failed:' + result.status;
      };

      req.expires = async () => {
        result = await (result || authenticate(req));
        if (result.status === 'auth-success') {
          return new Date(result.expires);
        }
        return undefined;
      };

      req.satisfies = () => {
        throw new Error('req.satisfies is deprecated! use req.authorize instead');
      };

      /**
       * Create method to check if request satisfies the scope expression. Given
       * extra parameters.
       * Return true, if successful and if unsuccessful it throws an Error with
       * code = 'AuthorizationError'.
       */
      req.authorize = async (params) => {
        result = await (result || authenticate(req));

        // If authentication failed
        if (result.status === 'auth-failed') {
          res.set('www-authenticate', 'hawk');
          const err = new Error('Authentication failed'); // This way instead of subclassing due to babel/babel#3083
          err.name = 'AuthenticationError';
          err.code = 'AuthenticationError';
          err.message = result.message;
          err.details = result;
          throw err;
        }

        // Render the scope expression template
        const scopeExpression = scopeTemplate.render(params);

        // Test that we have scope intersection, and hence, is authorized
        const authed = !scopeExpression || scopes.satisfiesExpression(result.scopes, scopeExpression);
        req.hasAuthed = true;

        if (!authed) {
          const err = new Error('Authorization failed'); // This way instead of subclassing due to babel/babel#3083
          err.name = 'AuthorizationError';
          err.code = 'AuthorizationError';
          err.messageTemplate = [
            'You do not have sufficient scopes. You are missing the following scopes:',
            '',
            '```',
            '{{unsatisfied}}',
            '```',
            '',
            'You have the scopes:',
            '',
            '```',
            '{{scopes}}',
            '```',
            '',
            'This request requires you to satisfy this scope expression:',
            '',
            '```',
            '{{required}}',
            '```',
          ].join('\n');
          err.details = {
            scopes: result.scopes,
            required: scopeExpression,
            unsatisfied: scopes.removeGivenScopes(result.scopes, scopeExpression),
          };
          throw err;
        }

        // TODO: log this in a structured format when structured logging is
        // available https://bugzilla.mozilla.org/show_bug.cgi?id=1307271
        authLog(`Authorized ${await req.clientId()} for ${req.method} access to ${req.originalUrl}`);
      };

      req.hasAuthed = false;

      // If authentication is deferred or satisfied, then we proceed,
      // substituting the request parameters by default
      if (!entry.scopes) {
        req.hasAuthed = true;  // No need to check auth if there are no scopes
        next();
      } else {
        // If url parameters is enough to parameterize we do it automatically
        if (useUrlParams) {
          await req.authorize(req.params);
        }
        next();
      }
    } catch (err) {
      if (err.code === 'AuthorizationError') {
        return res.reportError('InsufficientScopes', err.messageTemplate, err.details);
      } else if (err.code === 'AuthenticationError') {
        return res.reportError('AuthenticationFailed', err.message, err.details);
      }
      return res.reportInternalError(err);
    };
  };
};

exports.remoteAuthentication = remoteAuthentication;
