import { expect, use } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { Auth, createTemporaryCredentials, fromNow, request } from '../src';

use(chaiAsPromised);

describe('Auth', function() {
  this.timeout(30000);

  const auth = new Auth({
    credentials: {
      clientId: 'tester',
      accessToken: 'no-secret'
    }
  });

  it('should successfully ping', () => {
    return auth
      .ping()
      .then(({ alive }) => expect(alive).to.be.ok);
  });

  it('should build signed URL', () => {
    expect(auth.buildSignedUrl(auth.client, 'test'))
      .to.eventually.match(new RegExp('^https://auth.taskcluster.net/v1/clients/test\\?bewit'));
  });

  it('should request from signed URL', () => {
    return auth.buildSignedUrl(auth.testAuthenticateGet)
      .then(url => request(url));
  });

  it('should use a baseUrl if requested', () => {
    const auth = new Auth({
      baseUrl: 'https://localhost/auth/v1'
    });
    expect(auth.options.baseUrl).to.equal('https://localhost/auth/v1');
  });

  it('should fetch from signed URL with authorized scopes', () => {
    const auth = new Auth({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
      authorizedScopes: ['test:authenticate-get', 'test:foo']
    });
    return auth
      .buildSignedUrl(auth.testAuthenticateGet)
      .then(url => request(url))
      .then(({ scopes }) => {
        expect(scopes).to.deep.equal(['test:authenticate-get', 'test:foo']);
      });
  });

  it('should fetch from signed URL with temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['test:authenticate-get', 'test:bar'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });
    return auth
      .buildSignedUrl(auth.testAuthenticateGet)
      .then(url => request(url))
      .then(({ scopes }) => {
        expect(scopes).to.deep.equal(['test:authenticate-get', 'test:bar']);
      });
  });

  it('should fetch from expiring signed URL with temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['test:authenticate-get', 'test:bar'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });
    return auth
      .buildSignedUrl(auth.testAuthenticateGet, { expiration: 600 })
      then(url => request(url));
  });

  it('should fetch from signed URL with temporary credentials and authorized scopes', () => {
    const auth = new Auth({
      authorizedScopes: ['test:authenticate-get'],
      credentials: createTemporaryCredentials({
        scopes: ['test:auth*'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });
    return auth
      .buildSignedUrl(auth.testAuthenticateGet)
      .then(url => request(url))
      .then(({ scopes }) => {
        expect(scopes).to.deep.equal(['test:authenticate-get']);
      });
  });

  it('should fail fetch from expired signed URL with temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['test:authenticate-get', 'test:bar'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });
    return auth
      .buildSignedUrl(auth.testAuthenticateGet, { expiration: -600 })
      .then(url => request(url))
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.response.status).to.equal(401);
        }
      );
  });

  it('should fail fetch from signed URL with unauthorized scopes', () => {
    const auth = new Auth({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret',
      },
      authorizedScopes: ['test:get'] // missing test:authenticate-get
    });
    return auth
      .buildSignedUrl(auth.testAuthenticateGet)
      .then(url => request(url))
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.response.status).to.equal(403);
        }
      );
  });

  it('should request with authentication', () => {
    return auth
      .testAuthenticate({
        clientScopes: [],
        requiredScopes: []
      })
      .then(({ clientId, scopes }) => {
        expect(clientId).to.equal('tester');
        expect(scopes).to.deep.equal([]);
      });
  });

  it('should request with authentication and query string', () => {
    return auth
      .listClients({ prefix: 'abc' })
      .then(({ clients }) => expect(clients).to.deep.equal([]));
  });

  it('should fetch using authorized scopes', () => {
    const auth = new Auth({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret'
      },
      authorizedScopes: ['test:param']
    });

    return auth
      .testAuthenticate({
        clientScopes: ['test:*'],
        requiredScopes: ['test:param']
      })
      .then(({ clientId, scopes }) => {
        expect(clientId).to.equal('tester');
        expect(scopes).to.deep.equal(['test:param']);
      });
  });

  it('should fail fetch using unauthorized scopes', () => {
    const auth = new Auth({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret'
      },
      authorizedScopes: ['test:params']
    });

    return auth
      .testAuthenticate({
        clientScopes: ['test:*'],
        requiredScopes: ['test:something-else']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => expect(err).to.be.an('error')
      );
  });

  it('should fail fetch using insufficient scopes', () => {
    const auth = new Auth({
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret'
      },
      authorizedScopes: ['scopes:something-else']
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.body.code).to.equal('InsufficientScopes');
        }
      );
  });

  it('should fetch using unnamed temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['scopes:specific'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific']
      })
      .then(({ clientId, scopes }) => {
        expect(clientId).to.equal('tester');
        expect(scopes).to.deep.equal(['scopes:specific']);
      });
  });

  it('should fail fetch using unauthorized temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['test:params'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'wrong-secret'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['test:*'],
        requiredScopes: ['test:something-else']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.response.status).to.equal(401);
        }
      );
  });

  it('should fail fetch using insufficient temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['scopes:something-else'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:specific']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.body.code).to.equal('InsufficientScopes');
        }
      );
  });

  it('should fetch with named temporary credentials', () => {
    const credentials = createTemporaryCredentials({
      scopes: ['scopes:specific'],
      clientId: 'my-temp-cred',
      expiry: fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret'
      }
    });

    expect(credentials.clientId).to.equal('my-temp-cred');

    const auth = new Auth({ credentials });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*', 'auth:create-client:my-temp-cred'],
        requiredScopes: ['scopes:specific']
      })
      .then(({ clientId, scopes }) => {
        expect(clientId).to.equal('my-temp-cred');
        expect(scopes).to.deep.equal(['scopes:specific']);
      });
  });

  it('should fetch with named temporary credentials and authorized scopes', () => {
    const credentials = createTemporaryCredentials({
      scopes: ['scopes:*'],
      clientId: 'my-temp-cred',
      expiry: fromNow('1 hour'),
      credentials: {
        clientId: 'tester',
        accessToken: 'no-secret'
      }
    });

    expect(credentials.clientId).to.equal('my-temp-cred');

    const auth = new Auth({
      credentials,
      authorizedScopes: ['scopes:specific', 'scopes:another']
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*', 'auth:create-client:my-temp-cred'],
        requiredScopes: ['scopes:specific']
      })
      .then(({ clientId, scopes }) => {
        expect(clientId).to.equal('my-temp-cred');
        expect(scopes).to.deep.equal(['scopes:specific', 'scopes:another']);
      });
  });

  it('should fetch with temporary credentials using authorized scopes', () => {
    const auth = new Auth({
      authorizedScopes: ['scopes:subcategory:specific'],
      credentials: createTemporaryCredentials({
        scopes: ['scopes:subcategory:*'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:subcategory:specific']
      })
      .then(({ clientId, scopes }) => {
        expect(clientId).to.equal('tester');
        expect(scopes).to.deep.equal(['scopes:subcategory:specific']);
      });
  });

  it('should fail fetch using temporary credentials with unauthorized and insufficient scopes', () => {
    const auth = new Auth({
      authorizedScopes: ['scopes:subcategory:wrong-scope'],
      credentials: createTemporaryCredentials({
        scopes: ['scopes:subcategory:*'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:subcategory:specific']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.body.code).to.equal('InsufficientScopes');
        }
      )
  });

  it('should fail fetch using temporary credentials with authorized but bad authentication', () => {
    const auth = new Auth({
      authorizedScopes: ['scopes:subcategory:specific'],
      credentials: createTemporaryCredentials({
        scopes: ['scopes:subcategory:*'],
        expiry: fromNow('1 hour'),
        credentials: {
          clientId: 'tester',
          accessToken: 'wrong'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['scopes:*'],
        requiredScopes: ['scopes:subcategory:specific']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.body.code).to.equal('AuthenticationFailed');
        }
      )
  });

  it('should fail with bad authentication', () => {
    const auth = new Auth({
      credentials: {
        clientId: 'tester',
        accessToken: 'wrong'
      }
    });

    return auth
      .testAuthenticate({
        clientScopes: [],
        requiredScopes: []
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.body.code).to.equal('AuthenticationFailed');
        }
      );
  });

  it('should fail with bad scopes', () => {
    return auth
      .testAuthenticate({
        clientScopes: ['some-scope'],
        requiredScopes: ['another-scope']
      })
      .then(
        () => expect.fail('Expected request to fail'),
        (err) => {
          expect(err).to.be.an('error');
          expect(err.body.code).to.equal('InsufficientScopes');
        }
      );
  });
});
