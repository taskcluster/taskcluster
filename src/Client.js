import merge from 'deepmerge';
import clone from 'lodash.clonedeep';
import { stringify } from 'query-string';
import hawk from 'hawk';
import fetch from './fetch';

export default class Client {
  static defaults = {
    credentials: null,
    authorizedScopes: null,
    timeout: 30 * 1000,
    retries: 5,
    delayFactor: 100,
    randomizationFactor: 0.25,
    maxDelay: 30 * 1000
  };

  constructor(options = {}) {
    this.options = merge.all([Client.defaults, options, {
      baseUrl: (options.baseUrl || '').replace(/\/$/, ''),
      exchangePrefix: options.exchangePrefix || ''
    }]);

    if (this.options.randomizationFactor < 0 || this.options.randomizationFactor >= 1) {
      throw new Error('options.randomizationFactor must be between 0 and 1');
    }
  }

  debug(level, message) {
    if (!message) {
      message = level;
      level = 'info';
    }

    if (this.options.debug) {
      console[level](message);
    }
  }

  getMethodExpectedArity({ input, args }) {
    return input ? args.length + 1 : args.length;
  }

  buildExtraData() {
    const { credentials, authorizedScopes } = this.options;

    if (!credentials) {
      return null;
    }

    const { clientId, accessToken, certificate } = credentials;

    if (!clientId || !accessToken) {
      return null;
    }

    const extra = {};

    // If there is a certificate we have temporary credentials, and we
    // must provide the certificate
    if (certificate) {
      extra.certificate = typeof extra.certificate === 'string' ?
        JSON.parse(certificate) :
        certificate;
    }

    // If set of authorized scopes is provided, we'll restrict the request
    // to only use these scopes
    if (Array.isArray(authorizedScopes)) {
      extra.authorizedScopes = authorizedScopes;
    }

    // If extra has any keys, base64 encode it
    return Object.keys(extra).length ?
      window.btoa(JSON.stringify(extra)) :
      null;
  }

  buildEndpoint(entry, args) {
    return entry.route.replace(/<([^<>]+)>/g, (text, arg) => {
      const index = entry.args.indexOf(arg);

      // Preserve original
      if (index === -1) {
        return text;
      }

      const param = args[index];
      const type = typeof param;

      if (type !== 'string' && type !== 'number') {
        throw new Error(`URL parameter \`${arg}\` expected a string but was provided type "${type}"`);
      }

      return encodeURIComponent(param);
    });
  }

  buildUrl(method, ...args) {
    if (!method) {
      throw new Error('buildUrl is missing required `method` argument');
    }

    // Find the method
    const entry = method.entryReference;

    if (!entry || entry.type !== 'function') {
      throw new Error('Method in buildUrl must be an API method from the same object');
    }

    // Get the query string options taken
    const optionKeys = entry.query || [];
    const supportsOptions = optionKeys.length !== 0;
    const arity = entry.args.length;

    this.debug(`Building URL for: ${entry.name}`);

    if (args.length !== arity && (!supportsOptions || args.length !== arity + 1)) {
      throw new Error(
        `Method \`${entry.name}.buildUrl\` expected ${arity + 1} argument(s) but received ${args.length + 1}`
      );
    }

    const endpoint = this.buildEndpoint(entry, args);

    if (args[arity]) {
      Object
        .keys(args[arity])
        .forEach(key => {
          if (!optionKeys.includes(key)) {
            throw new Error(`Method \`${entry.name}\` expected options ${optionKeys.join(', ')} but received ${key}`);
          }
        });
    }

    const query = args[arity] ? `?${stringify(args[arity])}` : '';

    return `${this.options.baseUrl}${endpoint}${query}`;
  }

  buildSignedUrl(method, ...args) {
    if (!method) {
      throw new Error('buildSignedUrl is missing required `method` argument');
    }

    // Find reference entry
    const entry = method.entryReference;

    if (entry.method.toLowerCase() !== 'get') {
      throw new Error('buildSignedUrl only works for GET requests');
    }

    // Default to 15 minutes before expiration
    let expiration = 15 * 60;
    // Check if method supports query-string options
    const supportsOptions = (entry.query || []).length !== 0;
    // if longer than method + args, then we have options too
    const arity = entry.args.length + (supportsOptions ? 1 : 0);

    if (args.length > arity) {
      // Get request options
      const options = args.pop();

      if (options.expiration) {
        expiration = options.expiration;
      }

      if (typeof expiration !== 'number') {
        throw new Error('options.expiration must be a number');
      }
    }

    const url = this.buildUrl(method, ...args);
    const { credentials } = this.options;
    const { clientId, accessToken } = credentials;

    if (!clientId) {
      throw new Error('buildSignedUrl missing required credentials');
    }

    if (!accessToken) {
      throw new Error('buildSignedUrl missing required credentials accessToken');
    }

    const bewit = hawk.client.bewit(url, {
      credentials: {
        id: clientId,
        key: accessToken,
        algorithm: 'sha256'
      },
      ttlSec: expiration,
      ext: this.buildExtraData()
    });

    return url.includes('?') ? `${url}&bewit=${bewit}` : `${url}?bewit=${bewit}`;
  }

  validateMethod(entry, args = []) {
    const expectedArity = this.getMethodExpectedArity(entry);
    const queryOptions = entry.query || [];
    const arity = args.length;

    if (arity !== expectedArity && (queryOptions.length === 0 || arity !== expectedArity + 1)) {
      throw new Error(`${entry.name} expected ${expectedArity} arguments but only received ${arity}`);
    }

    Object
      .keys(args[expectedArity] || {})
      .forEach(key => {
        if (!queryOptions.includes(key)) {
          throw new Error(`${key} is not a valid option for ${entry.name}.
            Valid options include: ${queryOptions.join(', ')}`);
        }
      });
  }

  normalizeRoutingKeyPattern(entry, pattern) {
    const initialPattern = pattern || {};

    if (!(initialPattern instanceof Object)) {
      throw new Error('routingKeyPattern must be an object');
    }

    const routingKeyPattern = entry.routingKey
      .map(key => {
        const value = key.constant || initialPattern[key.name];

        if (typeof value === 'number') {
          return `${value}`;
        }

        if (typeof value === 'string') {
          if (value.includes('.') && !key.multipleWords) {
            throw new Error(
              `routingKeyPattern "${value}" for ${key.name} cannot contain dots since it does not hold multiple words`
            );
          }

          return value;
        }

        if (value != null) {
          throw new Error(`routingKey value "${value}" is not a valid pattern for ${key.name}`);
        }

        return key.multipleWords ? '#' : '*';
      })
      .join('.');

    return {
      routingKeyPattern,
      routingKeyReference: clone(entry.routingKey),
      exchange: `${this.options.exchangePrefix}${entry.exchange}`
    };
  }

  request(entry, args) {
    const expectedArity = this.getMethodExpectedArity(entry);
    const endpoint = this.buildEndpoint(entry, args);
    const query = args[expectedArity] ? `?${stringify(args[expectedArity])}` : '';
    const url = `${this.options.baseUrl}${endpoint}${query}`;
    const options = {
      method: entry.method
    };

    if (entry.input) {
      options.body = args[expectedArity - 1];
    }

    if (this.options.credentials) {
      options.credentials = this.options.credentials;
    }

    return fetch(url, options);
  }
}
