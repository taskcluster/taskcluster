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

    mocha.test(name, async function() {
      let got = await validator(input);
      assume(got).to.deeply.equal(expected);
    });
  };

  var testWithTemp = function(name, options, inputFn, expected) {
    // Get now as default value for start
    var now = new Date();
    now.setMinutes(now.getMinutes() - 5); // subtract 5 min for clock drift
    var then = new Date();
    then.setMinutes(then.getMinutes() + 5);

    // Set default options
    options = _.defaults({}, options, {
      start: now,
      expiry: then,
      scopes: [],
      accessToken: options.clientId + '-secret',
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
    debug(options);
    debug(cert);

    // Construct signature
    cert.signature = crypto
      .createHmac('sha256', options.accessToken)
      .update(
        [
          'version:'  + cert.version,
          'seed:'     + cert.seed,
          'start:'    + cert.start,
          'expiry:'   + cert.expiry,
          'scopes:'
        ].concat(cert.scopes).join('\n')
      )
      .digest('base64');

    if (options.signature) {
      cert.signature = crypto
        .createHmac('sha256', options.signature)
        .digest('base64');
    }

    // Construct temporary key
    var accessToken = crypto
      .createHmac('sha256', options.accessToken)
      .update(cert.seed)
      .digest('base64')
      .replace(/\+/g, '-')  // Replace + with - (see RFC 4648, sec. 5)
      .replace(/\//g, '_')  // Replace / with _ (see RFC 4648, sec. 5)
      .replace(/=/g,  '');  // Drop '==' padding

    // Return the generated temporary credentials
    test(name, inputFn(options.clientId, accessToken, cert), expected);
  };

  // shorthands
  let success = function(scopes) {
    return {status: 'auth-success', scheme: 'hawk', scopes};
  };

  let failed = function(message) {
    return {status: 'auth-failed', message};
  };

  test("simple credentials", {
    authorization: {
      credentials: {id: 'root'}
    }
  }, success(['*']));

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
    clientId: 'root',
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
    clientId: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate.expiry < now'));

  testWithTemp("invalid: postdated temporary credentials", {
    start: taskcluster.fromNow('1 hour'),
    expiry: taskcluster.fromNow('2 hour'),
    clientId: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate.start > now'));

  testWithTemp("invalid: year-long temporary credentials", {
    start: taskcluster.fromNow('-185 days'),
    expiry: taskcluster.fromNow('180 days'),
    clientId: 'root',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate cannot last longer than 31 days!'));

  testWithTemp("invalid: bad signature for temp creds", {
    clientId: 'root',
    signature: 'not the right one',
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed('ext.certificate.signature is not valid'));

  testWithTemp("invalid: temp scopes not satisfied by issuing client", {
    clientId: 'unpriv',
    scopes: ['godlike'],
  }, (id, key, certificate) => ({
    authorization: {
      credentials: {id, key},
      ext: {certificate},
    }
  }), failed("ext.certificate issuer `unpriv` doesn't have sufficient scopes"));

  testWithTemp("temporary credentials with authorizedScopes", {
    clientId: 'root',
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
    clientId: 'unpriv',
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
    clientId: 'unpriv',
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

  testWithTemp("bewit based on temporary scopes", {
    clientId: 'root',
    scopes: ['scope3'],
  }, (id, key, certificate) => ({
    bewit: {id, key, ext: {certificate}}
  }), success(['scope3']));

  testWithTemp("bewit based on temporary scopes and authorizedScopes", {
    clientId: 'root',
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
});
