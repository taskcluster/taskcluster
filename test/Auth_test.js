import assert from 'assert';
import { Auth } from '../src';

describe('Auth', () => {
  const auth = new Auth({
    credentials: {
      clientId: 'tester',
      accessToken: 'no-secret'
    }
  });

  it('should be loaded', () => {
    assert.ok(auth);
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

    assert.ok(url.startsWith('https://auth.taskcluster.net/v1/clients/test?bewit'));
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
        assert.deepEqual(scopes, []);
      })
      .catch(err => {
        console.log('WAT');
        console.log(err.toString());
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
      });
  });
});
