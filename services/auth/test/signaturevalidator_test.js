suite("signature validation", function() {
  var Promise      = require('promise');
  var assert       = require('assert');
  var mocha        = require('mocha');
  var debug        = require('debug')('test:signaturevalidator');
  var hawk         = require('hawk');
  var _            = require('lodash');
  var assume       = require('assume');
  var base         = require('taskcluster-base');
  var slugid       = require('slugid');
  var crypto       = require('crypto');
  var taskcluster  = require('taskcluster-client');
  var sigvalidator = require('../auth/signaturevalidator');

  var validator;
  var clients = {
    root: {
      clientId: 'root',
      accessToken: 'root-secret',
      scopes: ['*'],
    },
    unpriv: {
      clientId: 'unpriv',
      accessToken: 'unpriv-secret',
      scopes: ['scope2'],
    },
  };

  before(function() {
    validator = sigvalidator.createSignatureValidator({
      clientLoader: async clientId => {
        if (!clients[clientId]) {
          throw new Error("no such clientId");
        }
        return clients[clientId];
      },
      expandScopes: scopes => scopes,
    });
  });

  var test = function(name, input, expected) {
    mocha.test(name, async function() {
      // defer creation of input until the test runs, if necessary
      if (typeof input == "function") {
        input = input();
      }

      input = _.defaults({}, input, {
        method: 'GET',
        resource: '/',
        host: 'test.taskcluster.net',
        port: 443,
      });

      if (input.authorization) {
        let creds = input.authorization.credentials || {};
        input.authorization.credentials = _.defaults({}, creds, {
          key: creds.id + '-secret',
          algorithm: 'sha256',
        });

        // stringify ext
        if (typeof input.authorization.ext === 'object') {
          input.authorization.ext = new Buffer(
              JSON.stringify(input.authorization.ext))
            .toString('base64');
        }

        // create the authorization "header"
        let url = 'https://' + input.host + input.resource;
        input['authorization'] = hawk.client.header(
            url, input.method, input.authorization).field;
      }

      if (input.bewit) {
        input.bewit= _.defaults({}, input.bewit, {
          key: input.bewit.id + '-secret',
          algorithm: 'sha256',
        });

        if (typeof input.bewit.ext === 'object') {
          input.bewit.ext = new Buffer(
              JSON.stringify(input.bewit.ext))
            .toString('base64');
        }

        var bewit = hawk.client.getBewit('https://' + input.host + input.resource, {
          credentials: {
            id: input.bewit.id,
            key: input.bewit.key,
            algorithm: input.bewit.algorithm,
          },
          ttlSec: 15 * 60,
          ext: input.bewit.ext
        });
        input.resource += '?bewit=' + bewit;
        delete input.bewit;
      }

      let got = await validator(input);
      assume(got).to.deeply.equal(expected);
    });
  };

  var testWithTemp = function(name, options, inputFn, expected) {
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

      var start = new Date();
      start.setMinutes(start.getMinutes() - 5);
      var expiry = new Date();
      expiry.setMinutes(expiry.getMinutes() + 5);

      // Set default options
      options = _.defaults({}, options, {
        start,
        expiry,
        scopes: [],
        accessToken: id + '-secret',
      });

      // Construct certificate
      var cert = {
        version:    1,
        scopes:     _.cloneDeep(options.scopes),
        start:      options.start.getTime(),
        expiry:     options.expiry.getTime(),
        seed:       slugid.v4() + slugid.v4(),
        signature:  null  // generated later
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
        sig.update('version:'    + cert.version + '\n');
        if (options.credentialName && !options.omitClientIdFromSig) {
          sig.update('clientId:' + options.credentialName + '\n');
        }
        if (options.issuer && !options.omitIssuerFromSig) {
          sig.update('issuer:'   + options.issuer + '\n');
        }
        sig.update('seed:'       + cert.seed + '\n');
        sig.update('start:'      + cert.start + '\n');
        sig.update('expiry:'     + cert.expiry + '\n');
        sig.update('scopes:\n');
        sig.update(cert.scopes.join('\n'));
        cert.signature = sig.digest('base64');
      }

      // Construct temporary key
      var accessToken = crypto
        .createHmac('sha256', options.accessToken)
        .update(cert.seed)
        .digest('base64')
        .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
        .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
        .replace(/=/g,  '');  // Drop '==' padding

      return inputFn(id, accessToken, cert);
    }

    // Only make the certificate at test runtime; then the expiry times
    // are relevant to when the cert is examined
    test(name, makeInput, expected);
  };

  // shorthands
  let success = function(scopes, options) {
    options = options || {};
    let exp = {
      clientId: options.clientId || 'root',
      status: 'auth-success',
      scheme: 'hawk',
      scopes,
    };
    if (options.hash) {
      exp.hash = options.hash;
    }
    return exp;
  };

  let failed = function(message) {
    return {status: 'auth-failed', message};
  };

  test("simple credentials", {
    authorization: {
      credentials: {id: 'root'}
    }
  }, success(['*']));

  test("simple credentials with payload hash", {
    authorization: {
      credentials: {id: 'root'},
      payload: '{}',
    }
  }, success(['*'], {hash: 'XtNvx1FqrUYVOLlne3l2WzcyRfj9QeC6YtmhMKKFMGY='}));

  test("simple credentials, empty ext", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
      }
    }
  }, success(['*']));

  test("simple credentials, unknown field in ext (forward-compat)", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        'somefield': 'foo'
      }
    }
  }, success(['*']));

  test("simple credentials, bad secret", {
    authorization: {
      credentials: {
        id: 'root',
        key: 'root-wrong-secret',
      }
    }
  }, failed('Unauthorized: Bad mac'));

  test("simple credentials, bad id", {
    authorization: {
      credentials: {
        id: 'unknown',
        key: 'root-secret',
      }
    }
  }, failed('no such clientId'));

  test("invalid: bad ext", {
    authorization: {
      credentials: {id: 'root'},
      ext: 'abcd',
    }
  }, failed('Failed to parse ext'));

  test("invalid: non-object ext.certificate", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: true
      }
    }
  }, failed('ext.certificate must be a JSON object'));

  test("invalid: bad ext.certificate.version", {
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
      }
    }
  }, failed('ext.certificate.version must be 1'));

  test("invalid: bad seed type", {
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
      }
    }
  }, failed('ext.certificate.seed must be a string'));

  test("invalid: bad seed length", {
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
      }
    }
  }, failed('ext.certificate.seed must be 44 characters'));

  test("invalid: bad seed length", {
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
      }
    }
  }, failed('ext.certificate.seed must be 44 characters'));

  test("invalid: bad start type", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: "2016-07-27T14:32:15.407820Z",
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: [],
        },
      }
    }
  }, failed('ext.certificate.start must be a number'));

  test("invalid: bad expiry type", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: "2016-07-27T14:32:15.407820Z",
          scopes: [],
        },
      }
    }
  }, failed('ext.certificate.expiry must be a number'));

  test("invalid: bad scopes type", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        certificate: {
          version: 1,
          seed: slugid.v4() + slugid.v4(),
          start: taskcluster.fromNow('-1 minute').getTime(),
          expiry: taskcluster.fromNow('1 minute').getTime(),
          scopes: "all of them",
        },
      }
    }
  }, failed('ext.certificate.scopes must be an array'));

  test("invalid: bad scope type", {
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
      }
    }
  }, failed('ext.certificate.scopes must be an array of valid scopes'));

  test("invalid: bad scope format", {
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
      }
    }
  }, failed('ext.certificate.scopes must be an array of valid scopes'));

  test("authorized scopes", {
    authorization: {
      credentials: {id: 'root'},
      ext: {
        authorizedScopes: ['scope1:*', 'scope2'],
      }
    }
  }, success(['scope1:*', 'scope2']));

  test("invalid: authorized scopes not satisfied by clientId", {
    authorization: {
      credentials: {id: 'unpriv'},
      ext: {
        authorizedScopes: ['scope1:*', 'scope2'],
      }
    }
  }, failed('ext.authorizedScopes oversteps your scopes'));

  test("invalid: authorizedScopes not an array", {
    authorization: {
      credentials: {id: 'unpriv'},
      ext: {
        authorizedScopes: 'scope1:*',
      }
    }
  }, failed('ext.authorizedScopes must be an array'));

  test("invalid: authorizedScopes invalid scope", {
    authorization: {
      credentials: {id: 'unpriv'},
      ext: {
        authorizedScopes: ['scope1\n**'],
      }
    }
  }, failed('ext.authorizedScopes must be an array of valid scopes'));

  testWithTemp("basic temporary credentials", {
    id: 'root',
    scopes: ['tmpscope'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), success(['tmpscope']));

  testWithTemp("invalid: expired temporary credentials", {
    start: taskcluster.fromNow('-2 hour'),
    expiry: taskcluster.fromNow('-1 hour'),
    id: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate.expiry < now'));

  testWithTemp("invalid: postdated temporary credentials", {
    start: taskcluster.fromNow('1 hour'),
    expiry: taskcluster.fromNow('2 hour'),
    id: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate.start > now'));

  testWithTemp("invalid: year-long temporary credentials", {
    start: taskcluster.fromNow('-185 days'),
    expiry: taskcluster.fromNow('180 days'),
    id: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate cannot last longer than 31 days!'));

  testWithTemp("invalid: bad signature for temp creds", {
    id: 'root',
    signature: 'not the right one',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate.signature is not valid'));

  testWithTemp("invalid: temp scopes not satisfied by issuing client", {
    id: 'unpriv',
    scopes: ['godlike'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed("ext.certificate issuer `unpriv` doesn't have sufficient scopes"));

  testWithTemp("temporary credentials with authorizedScopes", {
    id: 'root',
    scopes: ['scope1:*', 'scope2:*'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scope1:a', 'scope2:b'],
      },
    }
  }), success(['scope1:a', 'scope2:b']));

  testWithTemp("invalid: temporary credentials with authorizedScopes not satisfied", {
    id: 'unpriv',
    scopes: ['scope2'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scope1', 'scope2'],
      },
    }
  }), failed('ext.authorizedScopes oversteps your scopes'));

  testWithTemp("invalid: temporary credentials with authorizedScopes, temp not satisfied", {
    id: 'unpriv',
    scopes: ['scope999'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
        authorizedScopes: ['scope999'],
      },
    }
  }), failed("ext.certificate issuer `unpriv` doesn't have sufficient scopes"));

  testWithTemp("named temporary credentials", {
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
    }
  }), success(['tmpscope'], {clientId: 'my-temp-cred'}));

  testWithTemp("named temporary credentials with authorizedScopes", {
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
    }
  }), success(['scopes:1', 'scopes:2'], {clientId: 'my-temp-cred'}));

  testWithTemp("invalid: named temporary credentials with issuer == clientId", {
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
    }
  }), failed('ext.certificate.issuer must differ from the supplied clientId'));

  testWithTemp("invalid: named temporary credentials clientId != name", {
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
    }
  }), failed('ext.certificate.signature is not valid, or wrong clientId provided'));

  testWithTemp("invalid: named temporary credentials with issuer but no name in signature", {
    id: 'my-temp-cred',
    accessToken: 'root-secret',
    scopes: ['tmpscope'],
    credentialName: 'my-temp-cred',
    issuer: 'root',
    omitClientIdFromSig: true
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {
        certificate,
      },
    }
  }), failed('ext.certificate.signature is not valid, or wrong clientId provided'));

  testWithTemp("invalid: named temporary credentials with name that issuer cannot create", {
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
    }
  }), failed("ext.certificate issuer `unpriv` doesn't have " +
             "`auth:create-client:cant-create-this` for supplied clientId."));

  test("simple bewit", {
    bewit: {
      id: 'root',
    }
  }, success(['*']));

  test("bewit with authorizedScopes", {
    bewit: {
      id: 'root',
      ext: {
        authorizedScopes: ['scope1:*'],
      }
    }
  }, success(['scope1:*']));

  test("invalid: bewit with bad key", {
    bewit: {
      id: 'root',
      key: 'not-root',
    }
  }, failed('Unauthorized: Bad mac'));

  test("invalid: bogus bewit", {
    resource: '/?bewit=' + slugid.v4(),
  }, failed('Bad Request: Invalid bewit structure'));

  test("invalid: bewit with unknown client", {
    bewit: {
      id: 'somebody',
    }
  }, failed('no such clientId'));

  test("bewit with unknown client", {
    bewit: {
      id: 'somebody',
    }
  }, failed('no such clientId'));

  testWithTemp("bewit based on temporary creds", {
    id: 'root',
    scopes: ['scope3'],
  }, (id, key, certificate) => ({
    bewit: {id, key, ext: {certificate}}
  }), success(['scope3']));

  testWithTemp("bewit based on temporary creds and authorizedScopes", {
    id: 'root',
    scopes: ['scope*'],
  }, (id, key, certificate) => ({
    bewit: {
      id,
      key,
      ext: {
        authorizedScopes: ['scope3'],
        certificate,
      }
    }
  }), success(['scope3']));

  testWithTemp("bewit based on named temporary creds and authorizedScopes", {
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
      }
    }
  }), success(['scope3'], {clientId: 'root/temp-url'}));
});
