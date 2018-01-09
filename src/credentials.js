import hawk from 'hawk';
import { v4 } from './utils';
import Auth from './clients/Auth';

const THIRTY_ONE_DAYS = 31 * 24 * 60 * 60 * 1000;
const createHmac = (...args) => hawk.crypto.utils.algo.HMAC.create(...args);
const sha256 = hawk.crypto.utils.algo.SHA256;
const base64 = hawk.crypto.utils.enc.Base64;

/**
 * Construct a set of temporary credentials.
 *
 * options:
 * {
 *  start:        new Date(),   // Start time of credentials (defaults to now)
 *  expiry:       new Date(),   // Credentials expiration time
 *  scopes:       ['scope'...], // Scopes granted (defaults to empty-set)
 *  clientId:     '...',  // *optional* name to create named temporary credential
 *  credentials: {        // (defaults to use global config, if available)
 *    clientId:    '...', // ClientId
 *    accessToken: '...', // AccessToken for clientId
 *  },
 * }
 *
 * Note that a named temporary credential is only valid if the issuing credentials
 * have the scope 'auth:create-client:<name>'.  This function does not check for
 * this scope, but it will be checked when the credentials are used.
 *
 * The auth service already tolerates up to five minutes clock drift for start
 * and expiry fields, therefore caller should *not* apply further clock skew
 * adjustment.
 *
 * Returns an object on the form: {clientId, accessToken, certificate}
 */
export const createTemporaryCredentials = (opts) => {
  if (!opts) {
    throw new Error('Missing required options');
  }

  // auth service handles clock drift (PR #117) - should not skew times here
  const now = new Date();
  const options = { start: now, scopes: [], ...opts };
  const isNamed = !!options.clientId;

  if (!options.credentials) {
    throw new Error('options.credentials is required');
  }

  if (!options.credentials.clientId) {
    throw new Error('options.credentials.clientId is required');
  }

  if (isNamed && options.clientId === options.credentials.clientId) {
    throw new Error('Credential issuer must be different from the name');
  }

  if (!options.credentials.accessToken) {
    throw new Error('options.credentials.accessToken is required');
  }

  if (options.credentials.certificate != null) {
    throw new Error(`Temporary credentials cannot be used to make new temporary credentials.
      Ensure that options.credentials.certificate is null.`);
  }

  if (!(options.start instanceof Date)) {
    throw new Error('options.start must be a Date object');
  }

  if (!(options.expiry instanceof Date)) {
    throw new Error('options.expiry must be a Date object');
  }

  if (+options.expiry - options.start > THIRTY_ONE_DAYS) {
    throw new Error('Credentials cannot span more than 31 days');
  }

  if (!Array.isArray(options.scopes)) {
    throw new Error('options.scopes must be an array');
  }

  options.scopes.forEach((scope) => {
    if (typeof scope !== 'string') {
      throw new Error('options.scopes must be an array of strings');
    }
  });

  const certificate = {
    version: 1,
    scopes: [...options.scopes],
    start: options.start.getTime(),
    expiry: options.expiry.getTime(),
    seed: v4() + v4(),
    signature: null,
    issuer: isNamed ? options.credentials.clientId : null
  };

  const signature = createHmac(sha256, options.credentials.accessToken);

  signature.update(`version:${certificate.version}\n`);

  if (isNamed) {
    signature.update(`clientId:${options.clientId}\n`);
    signature.update(`issuer:${options.credentials.clientId}\n`);
  }

  signature.update(`seed:${certificate.seed}\n`);
  signature.update(`start:${certificate.start}\n`);
  signature.update(`expiry:${certificate.expiry}\n`);
  signature.update('scopes:\n');
  signature.update(certificate.scopes.join('\n'));
  certificate.signature = signature.finalize().toString(base64);

  const accessToken = createHmac(sha256, options.credentials.accessToken)
    .update(certificate.seed)
    .finalize()
    .toString(base64)
    .replace(/\+/g, '-') // Replace + with - (see RFC 4648, sec. 5)
    .replace(/\//g, '_') // Replace / with _ (see RFC 4648, sec. 5)
    .replace(/=/g, ''); // Drop '==' padding

  return {
    accessToken,
    clientId: isNamed ? options.clientId : options.credentials.clientId,
    certificate: JSON.stringify(certificate)
  };
};

/**
 * Get information about a set of credentials.
 *
 * credentials: {
 *   clientId,
 *   accessToken,
 *   certificate,           // optional
 * }
 *
 * result: Promise for
 * {
 *    clientId: ..,         // name of the credential
 *    type: ..,             // type of credential, e.g., "temporary"
 *    active: ..,           // active (valid, not disabled, etc.)
 *    start: ..,            // validity start time (if applicable)
 *    expiry: ..,           // validity end time (if applicable)
 *    scopes: [...],        // associated scopes (if available)
 * }
 */
export const credentialInformation = async (credentials) => {
  let issuer = credentials.clientId;
  const result = {
    clientId: issuer,
    active: true
  };

  // Distinguish permanent credentials from temporary credentials
  if (credentials.certificate) {
    let certificate = credentials.certificate;

    if (typeof certificate === 'string') {
      try {
        certificate = JSON.parse(certificate);
      } catch (err) {
        return Promise.reject(err);
      }
    }

    result.type = 'temporary';
    result.scopes = certificate.scopes;
    result.start = new Date(certificate.start);
    result.expiry = new Date(certificate.expiry);

    if (certificate.issuer) {
      issuer = certificate.issuer;
    }
  } else {
    result.type = 'permanent';
  }

  const anonymousClient = new Auth();
  const credentialsClient = new Auth({ credentials });
  const clientLookup = anonymousClient
    .client(issuer)
    .then((client) => {
      const expires = new Date(client.expires);

      if (!result.expiry || result.expiry > expires) {
        result.expiry = expires;
      }

      if (client.disabled) {
        result.active = false;
      }
    });
  const scopeLookup = credentialsClient
    .currentScopes()
    .then((response) => {
      result.scopes = response.scopes;
    });

  await Promise.all([clientLookup, scopeLookup]);

  const now = new Date();

  if (result.start && result.start > now) {
    result.active = false;
  } else if (result.expiry && result.expiry < now) {
    result.active = false;
  }

  return result;
};
