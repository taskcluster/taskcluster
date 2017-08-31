import assert from 'assert';
import { Auth, createTemporaryCredentials } from '../src';

describe('Auth', function() {
  this.timeout(30000);

  const auth = new Auth({
    credentials: {
      clientId: 'tester',
      accessToken: 'no-secret'
    }
  });

  it('should be loaded', () => {
    assert(auth);
  });

  it('should successfully ping', () => {
    return auth
      .ping()
      .then(({ alive }) => assert.ok(alive))
      .catch(err => {
        console.log(err);
      });
  });

  it('should build signed URL', () => {
    const url = auth.buildSignedUrl(auth.client, 'test');

    assert(url.startsWith('https://auth.taskcluster.net/v1/clients/test?bewit'));
  });

  it('should request with authentication', () => {
    return auth
      .testAuthenticate({
        clientScopes: [],
        requiredScopes: []
      })
      .then(({ clientId, scopes }) => {
        assert.equal(clientId, 'tester');
        assert.deepEqual(scopes, []);
      });
  });

  it('should request with authentication and query string', () => {
    return auth
      .listClients({ prefix: 'abc' })
      .then(clients => assert.deepEqual(clients, []));
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
        assert.equal(clientId, 'tester');
        assert.deepEqual(scopes, ['test:param']);
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
        () => assert(false, 'Expected request to fail'),
        (err) => assert(err)
      );
  });

  it('should fetch using temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['test:param'],
        expiry: new Date(new Date().getTime() + 60 * 1000),
        credentials: {
          clientId: 'tester',
          accessToken: 'no-secret'
        }
      })
    });

    return auth
      .testAuthenticate({
        clientScopes: ['test:*'],
        requiredScopes: ['test:param']
      })
      .then(({ clientId, scopes }) => {
        assert.equal(clientId, 'tester');
        assert.deepEqual(scopes, ['test:param']);
      });
  });

  it('should fail fetch using unauthorized temporary credentials', () => {
    const auth = new Auth({
      credentials: createTemporaryCredentials({
        scopes: ['test:params'],
        expiry: new Date(new Date().getTime() + 60 * 1000),
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
        () => assert(false, 'Expected request to fail'),
        (err) => {
          assert(err);
          assert(err.status === 401, 'Expected HTTP 401');
        });
  });

  it('should fetch signed URL', () => {
    const url = auth.buildSignedUrl(auth.listClients, { prefix: 'non-existent/' });

    return fetch(url, { method: 'GET' });
  });
});
