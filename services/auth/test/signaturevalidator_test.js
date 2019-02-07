const helper = require('./helper');
const assert = require('assert');
const debug = require('debug')('test:signaturevalidator');
const hawk = require('hawk');
const _ = require('lodash');
const assume = require('assume');
const slugid = require('slugid');
const crypto = require('crypto');
const taskcluster = require('taskcluster-client');
const sigvalidator = require('../src/signaturevalidator');
const Monitor = require('taskcluster-lib-monitor');

suite(helper.suiteName(__filename), function() {
  let one_hour = taskcluster.fromNow('1 hour');
  let two_hours = taskcluster.fromNow('2 hour');
  let three_hours = taskcluster.fromNow('3 hour');

  let validator;
  let clients = {
    root: {
      clientId: 'root',
      accessToken: 'root-secret',
      expires: two_hours,
      scopes: ['*'],
    },
    unpriv: {
      clientId: 'unpriv',
      accessToken: 'unpriv-secret',
      expires: two_hours,
      scopes: ['scope2'],
    },
  };

  suiteSetup(async function() {
    validator = sigvalidator.createSignatureValidator({
      clientLoader: async clientId => {
        if (!clients[clientId]) {
          throw new Error('no such clientId');
        }
        return clients[clientId];
      },
      expandScopes: scopes => scopes,
      monitor: new Monitor({projectName: 'foo', mock: true}),
    });
  });

  let makeTest = function(name, input, expected) {
    test(name, async function() {
      // defer creation of input until the test runs, if necessary
      if (typeof input == 'function') {
        input = input();
      }

      input = _.defaults({}, input, {
        method: 'GET',
        resource: '/',
        host: 'test.taskcluster.net',
        port: 443,
        sourceIp: '127.0.0.1',
      });

      if (input.authorization) {
        let creds = input.authorization.credentials || {};
        input.authorization.credentials = _.defaults({}, creds, {
          key: creds.id + '-secret',
          algorithm: 'sha256',
        });

        // stringify ext
        if (typeof input.authorization.ext === 'object') {
          input.authorization.ext = Buffer.from(
            JSON.stringify(input.authorization.ext))
            .toString('base64');
        }

        // create the authorization "header"
        let url = 'https://' + input.host + input.resource;
        input['authorization'] = hawk.client.header(
          url, input.method, input.authorization).header;
      }

      if (input.bewit) {
        input.bewit= _.defaults({}, input.bewit, {
          key: input.bewit.id + '-secret',
          algorithm: 'sha256',
        });

        if (typeof input.bewit.ext === 'object') {
          input.bewit.ext = Buffer.from(
            JSON.stringify(input.bewit.ext))
            .toString('base64');
        }

        let bewit = hawk.client.getBewit('https://' + input.host + input.resource, {
          credentials: {
            id: input.bewit.id,
            key: input.bewit.key,
            algorithm: input.bewit.algorithm,
          },
          ttlSec: 15 * 60,
          ext: input.bewit.ext,
        });
        input.resource += '?bewit=' + bewit;
        delete input.bewit;
      }

      let got = await validator(input);
      assume(got).to.deeply.equal(expected);
    });
  };

  let testWithTemp = function(name, options, inputFn, expected) {
    /**
     * Options is on the form
     * {
     *   id: id to return
     *   accessToken: accessToken for clientId or (if given in ext) issuer
     *   start, expiry: Date objects included in cert
     *   scopes: scopes for cert
     *   credentialName: credentialName to include in sig
     *   issuer: issuer to include in cert/sig
     *   omitClientIdFromSig: if true, omit the `clientId` line from the signature
     *   omitIssuerFromCert: if true, omit the `issuer` property of the cert
     *   omitIssuerFromSig: if true, omit the `issuer` line from the signature
     * }
     */
    let makeInput = () => {
      let id = options.id;

      let start = new Date();
      start.setMinutes(start.getMinutes() - 5);

      // Set default options
      options = _.defaults({}, options, {
        start,
        expiry: two_hours,
        scopes: [],
        accessToken: id + '-secret',
      });

      // Construct certificate
      let cert = {
        version: 1,
        scopes: _.cloneDeep(options.scopes),
        start: options.start.getTime(),
        expiry: options.expiry.getTime(),
        seed: slugid.v4() + slugid.v4(),
        signature: null, // generated later
      };

      if (options.issuer && !options.omitIssuerFromCert) {
        cert.issuer = options.issuer;
      }

      // Construct signature
      if (options.signature) {
        cert.signature = crypto
          .createHmac('sha256', options.signature)
          .digest('base64');
      } else {
        let sig = crypto.createHmac('sha256', options.accessToken);
        sig.update('version:' + cert.version + '\n');
        if (options.credentialName && !options.omitClientIdFromSig) {
          sig.update('clientId:' + options.credentialName + '\n');
        }
        if (options.issuer && !options.omitIssuerFromSig) {
          sig.update('issuer:' + options.issuer + '\n');
        }
        sig.update('seed:' + cert.seed + '\n');
        sig.update('start:' + cert.start + '\n');
        sig.update('expiry:' + cert.expiry + '\n');
        sig.update('scopes:\n');
        sig.update(cert.scopes.join('\n'));
        cert.signature = sig.digest('base64');
      }

      // Construct temporary key
      let accessToken = crypto
        .createHmac('sha256', options.accessToken)
        .update(cert.seed)
        .digest('base64')
        .replace(/\+/g, '-') // Replace + with - (see RFC 4648, sec. 5)
        .replace(/\//g, '_') // Replace / with _ (see RFC 4648, sec. 5)
        .replace(/=/g, ''); // Drop '==' padding

      return inputFn(id, accessToken, cert);
    };

    // Only make the certificate at test runtime; then the expiry times
    // are relevant to when the cert is examined
    makeTest(name, makeInput, expected);
  };

  // shorthands
  let success = function(scopes, options) {
    options = options || {};
    let exp = {
      clientId: options.clientId || 'root',
      status: 'auth-success',
      scheme: 'hawk',
      expires: two_hours,
      scopes,
    };
    if (options.hash) {
      exp.hash = options.hash;
    }
    if (options.expires) {
      exp.expires = options.expires;
    }
    return exp;
  };

  let failed = function(message) {
    return {status: 'auth-failed', message};
  };

  makeTest('simple credentials', {
    authorization: {
      credentials: {id: 'root'},
    },
  }, success(['*']));

  makeTest('simple credentials with payload hash', {
    authorization: {
      credentials: {id: 'root'},
      payload: '{}',
    },
  }, success(['*'], {hash: 'XtNvx1FqrUYVOLlne3l2WzcyRfj9QeC6YtmhMKKFMGY='}));

  makeTest('simple credentials, empty ext', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
      },
    },
  }, success(['*']));

  makeTest('simple credentials, unknown field in ext (forward-compat)', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        somefield: 'foo',
      },
    },
  }, success(['*']));

  makeTest('simple credentials, bad secret', {
    authorization: {
      credentials: {
        id: 'root',
        key: 'root-wrong-secret',
      },
    },
  }, failed('Unauthorized: Bad mac'));

  makeTest('simple credentials, bad id', {
    authorization: {
      credentials: {
        id: 'unknown',
        key: 'root-secret',
      },
    },
  }, failed('no such clientId'));

  makeTest('invalid: bad ext', {
    authorization: {
      credentials: {id: 'root'},
      ext: 'abcd',
    },
  }, failed('Failed to parse ext'));

  makeTest('invalid: non-object ext.certificate', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: true,
      },
    },
  }, failed('ext.certificate must be a JSON object'));

  makeTest('invalid: bad ext.certificate.version', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 999,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [],
        },
      },
    },
  }, failed('ext.certificate.version must be 1'));

  makeTest('invalid: bad seed type', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: 123,
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [],
        },
      },
    },
  }, failed('ext.certificate.seed must be a string'));

  makeTest('invalid: bad seed length', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [],
        },
      },
    },
  }, failed('ext.certificate.seed must be 44 characters'));

  makeTest('invalid: bad seed length', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [],
        },
      },
    },
  }, failed('ext.certificate.seed must be 44 characters'));

  makeTest('invalid: bad start type', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: '2016-07-27T14:32:15.407820Z',
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [],
        },
      },
    },
  }, failed('ext.certificate.start must be a number'));

  makeTest('invalid: bad expiry type', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: '2016-07-27T14:32:15.407820Z',
          scopes: [],
        },
      },
    },
  }, failed('ext.certificate.expiry must be a number'));

  makeTest('invalid: bad scopes type', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: 'all of them',
        },
      },
    },
  }, failed('ext.certificate.scopes must be an array'));

  makeTest('invalid: bad scope type', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [1, 2],
        },
      },
    },
  }, failed('ext.certificate.scopes must be an array of valid scopes'));

  makeTest('invalid: bad scope format', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: ['one\ntwo'],
        },
      },
    },
  }, failed('ext.certificate.scopes must be an array of valid scopes'));

  makeTest('authorized scopes', {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        authorizedScopes: ['scope1:*', 'scope2'],
      },
    },
  }, success(['scope1:*', 'scope2']));

  makeTest('invalid: authorized scopes not satisfied by clientId', {
    authorization: {
      credentials: {id: 'unpriv'},
      ext: {
        authorizedScopes: ['scope1:*', 'scope2'],
      },
    },
  }, failed('Supplied credentials do not satisfy authorizedScopes; '
    + `credentials have scopes [${clients.unpriv.scopes}]; `
    + 'authorizedScopes are [scope1:*,scope2]'));

  makeTest('invalid: authorizedScopes not an array', {
    authorization: {
      credentials: {id: 'unpriv'},
      ext: {
        authorizedScopes: 'scope1:*',
      },
    },
  }, failed('ext.authorizedScopes must be an array'));

  makeTest('invalid: authorizedScopes invalid scope', {
    authorization: {
      credentials: {id: 'unpriv'},
      ext: {
        authorizedScopes: ['scope1\n**'],
      },
    },
  }, failed('ext.authorizedScopes must be an array of valid scopes'));

  testWithTemp('basic temporary credentials', {
    id: 'root',
    scopes: ['tmpscope'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), success(['tmpscope']));

  testWithTemp('invalid: expired temporary credentials', {
    start: taskcluster.fromNow('-2 hour'),
    expiry: taskcluster.fromNow('-1 hour'),
    id: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), failed('ext.certificate.expiry < now'));

  testWithTemp('temporary credentials that expire soon give correct expiration', {
    expiry: one_hour,
    id: 'root',
    scopes: ['tmpscope'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), success(['tmpscope'], {expires: one_hour}));

  testWithTemp('temporary credentials that expire after issuer give correct expiration', {
    expiry: three_hours,
    id: 'root',
    scopes: ['tmpscope'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), success(['tmpscope'], {expires: two_hours}));

  testWithTemp('invalid: postdated temporary credentials', {
    start: taskcluster.fromNow('1 hour'),
    expiry: taskcluster.fromNow('2 hour'),
    id: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), failed('ext.certificate.start > now'));

  testWithTemp('invalid: year-long temporary credentials', {
    start: taskcluster.fromNow('-185 days'),
    expiry: taskcluster.fromNow('180 days'),
    id: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), failed('ext.certificate cannot last longer than 31 days!'));

  testWithTemp('invalid: bad signature for temp creds', {
    id: 'root',
    signature: 'not the right one',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), failed('ext.certificate.signature is not valid'));

  testWithTemp('invalid: temp scopes not satisfied by issuing client', {
    id: 'unpriv',
    scopes: ['godlike'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    },
  }), failed('ext.certificate issuer `unpriv` doesn\'t satisfiy all certificate ' +
             'scopes godlike.  The temporary credentials were not generated correctly.'));

  testWithTemp('temporary credentials with authorizedScopes', {
    id: 'root',
    scopes: ['scope1:*', 'scope2:*'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scope1:a', 'scope2:b'],
      },
    },
  }), success(['scope1:a', 'scope2:b']));

  testWithTemp('invalid: temporary credentials with authorizedScopes not satisfied', {
    id: 'unpriv',
    scopes: ['scope2'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scope1', 'scope2'],
      },
    },
  }), failed('Supplied credentials do not satisfy authorizedScopes; '
    + `credentials have scopes [${clients.unpriv.scopes}]; `
    + 'authorizedScopes are [scope1,scope2]'));

  testWithTemp('invalid: temporary credentials with authorizedScopes, temp not satisfied', {
    id: 'unpriv',
    scopes: ['scope999'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scope999'],
      },
    },
  }), failed('ext.certificate issuer `unpriv` doesn\'t satisfiy all certificate scopes ' +
             'scope999.  The temporary credentials were not generated correctly.'));

  testWithTemp('named temporary credentials', {
    id: 'my-temp-cred',
    accessToken: 'root-secret',
    scopes: ['tmpscope'],
    credentialName: 'my-temp-cred',
    issuer: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
      },
    },
  }), success(['tmpscope'], {clientId: 'my-temp-cred'}));

  testWithTemp('named temporary credentials with authorizedScopes', {
    id: 'my-temp-cred',
    accessToken: 'root-secret',
    scopes: ['scopes:*'],
    credentialName: 'my-temp-cred',
    issuer: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scopes:1', 'scopes:2'],
      },
    },
  }), success(['scopes:1', 'scopes:2'], {clientId: 'my-temp-cred'}));

  testWithTemp('invalid: named temporary credentials with issuer == clientId', {
    id: 'root',
    accessToken: 'root-secret',
    scopes: ['tmpscope'],
    credentialName: 'root',
    issuer: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
      },
    },
  }), failed('ext.certificate.issuer must differ from the supplied clientId'));

  testWithTemp('invalid: named temporary credentials clientId != name', {
    id: 'some-temp-cred',
    accessToken: 'root-secret',
    scopes: ['tmpscope'],
    credentialName: 'my-temp-cred',
    issuer: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
      },
    },
  }), failed('ext.certificate.signature is not valid, or wrong clientId provided'));

  testWithTemp('invalid: named temporary credentials with issuer but no name in signature', {
    id: 'my-temp-cred',
    accessToken: 'root-secret',
    scopes: ['tmpscope'],
    credentialName: 'my-temp-cred',
    issuer: 'root',
    omitClientIdFromSig: true,
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
      },
    },
  }), failed('ext.certificate.signature is not valid, or wrong clientId provided'));

  testWithTemp('invalid: named temporary credentials with name that issuer cannot create', {
    id: 'cant-create-this',
    accessToken: 'unpriv-secret',
    scopes: [],
    credentialName: 'cant-create-this',
    issuer: 'unpriv',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
      },
    },
  }), failed('ext.certificate issuer `unpriv` doesn\'t have ' +
             '`auth:create-client:cant-create-this` for supplied clientId.'));

  makeTest('simple bewit', {
    bewit: {
      id: 'root',
    },
  }, success(['*']));

  makeTest('bewit with authorizedScopes', {
    bewit: {
      id: 'root',
      ext: {
        authorizedScopes: ['scope1:*'],
      },
    },
  }, success(['scope1:*']));

  makeTest('invalid: bewit with bad key', {
    bewit: {
      id: 'root',
      key: 'not-root',
    },
  }, failed('Unauthorized: Bad mac'));

  makeTest('invalid: bogus bewit', {
    resource: '/?bewit=' + slugid.v4(),
  }, failed('Bad Request: Invalid bewit structure'));

  makeTest('invalid: bewit with unknown client', {
    bewit: {
      id: 'somebody',
    },
  }, failed('no such clientId'));

  makeTest('bewit with unknown client', {
    bewit: {
      id: 'somebody',
    },
  }, failed('no such clientId'));

  testWithTemp('bewit based on temporary creds', {
    id: 'root',
    scopes: ['scope3'],
  }, (id, key, certificate) => ({
    bewit: {id, key, ext: {certificate}},
  }), success(['scope3']));

  testWithTemp('bewit based on temporary creds and authorizedScopes', {
    id: 'root',
    scopes: ['scope*'],
  }, (id, key, certificate) => ({
    bewit: {
      id,
      key,
      ext: {
        authorizedScopes: ['scope3'],
        certificate,
      },
    },
  }), success(['scope3']));

  testWithTemp('bewit based on named temporary creds and authorizedScopes', {
    id: 'root/temp-url',
    accessToken: 'root-secret',
    scopes: ['scope*'],
    credentialName: 'root/temp-url',
    issuer: 'root',
  }, (id, key, certificate) => ({
    bewit: {
      id,
      key,
      ext: {
        authorizedScopes: ['scope3'],
        certificate,
      },
    },
  }), success(['scope3'], {clientId: 'root/temp-url'}));
});
