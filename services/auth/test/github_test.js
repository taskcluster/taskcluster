import helper from './helper.js';
import assert from 'node:assert';
import testing from '@taskcluster/lib-testing';

helper.secrets.mockSuite(testing.suiteName(), ['azure', 'gcp'], (mock, skipping) => {
  helper.withDb(mock, skipping);
  helper.withCfg(mock, skipping);
  helper.withGithub(skipping);
  helper.withPulse(skipping);
  helper.withServers(skipping);
  helper.resetTables();

  test('Getting a repo token with no scopes 403s', async () => {
    helper.setupScopes('none');
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InsufficientScopes' && err.statusCode === 403
    );
  });

  test('Getting a repo token with the right scopes works', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:read');
    const resp = await helper.apiClient.githubRepoToken('testapp', 'testorg', {
      repositories: ['bar'],
      permissions: { contents: 'read' },
    });

    assert.equal(resp.token, 'token-12345-contents:read-bar');
    assert.ok(new Date(resp.expires) > new Date());
  });

  test('Getting a user repo token with the right scopes works', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testuser/bar:contents:read');
    const resp = await helper.apiClient.githubRepoToken('testapp', 'testuser', {
      repositories: ['bar'],
      permissions: { contents: 'read' },
    });

    assert.equal(resp.token, 'token-67890-contents:read-bar');
    assert.ok(new Date(resp.expires) > new Date());
  });

  test('Getting a repo token for multiple repos 403s if one of the repo scope is missing', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:read');
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar', 'baz'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InsufficientScopes' && err.statusCode === 403
    );
  });

  test('Getting a repo token for multiple permissions 403s if one of the permission scope is missing', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:read');
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'read', actions: 'read' },
        }),
      err => err.code === 'InsufficientScopes' && err.statusCode === 403
    );
  });

  test('Getting a repo token with the wrong level 403s', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:write');

    // Doesn't widen
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InsufficientScopes' && err.statusCode === 403
    );

    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:read');
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'write' },
        }),
      err => err.code === 'InsufficientScopes' && err.statusCode === 403
    );
  });

  test('Owner names are not case sensitive', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:read');
    const resp = await helper.apiClient.githubRepoToken('testapp', 'TeStOrG', {
      repositories: ['bar'],
      permissions: { contents: 'read' },
    });
    assert.equal(resp.token, 'token-12345-contents:read-bar');
  });

  test('Repo names are not case sensitive', async () => {
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:read');
    const resp = await helper.apiClient.githubRepoToken('testapp', 'testorg', {
      repositories: ['Bar'],
      permissions: { contents: 'read' },
    });
    assert.equal(resp.token, 'token-12345-contents:read-bar');
  });

  test('Invalid permissions are rejected', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar'],
          permissions: { invalid: 'read' },
        }),
      err => err.code === 'InputValidationError' && err.statusCode === 400
    );
  });

  test('Levels not supported by a permission are rejected', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'admin' },
        }),
      err => err.code === 'InputValidationError' && err.statusCode === 400
    );
  });

  test('Non existent app returns a 404', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('charlie', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'ResourceNotFound' && err.statusCode === 404
    );

    // Make sure we don't leak app existence
    helper.setupScopes('auth:github-repo-token:testapp/testorg/bar:contents:write');
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('charlie', 'testorg', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InsufficientScopes' && err.statusCode === 403
    );
  });

  test('Renamed app returns a 400', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'testorgrenamed', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InputError' && err.statusCode === 400
    );
  });

  test('App not installed returns a 404', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'notinstalled', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'ResourceNotFound' && err.statusCode === 404
    );
  });

  test('Requesting multiple scopes on multiple repos works', async () => {
    let resp = await helper.apiClient.githubRepoToken('testapp', 'testorg', {
      repositories: ['bar', 'baz'],
      permissions: { contents: 'write', actions: 'read' },
    });
    assert.equal(resp.token, 'token-12345-contents:write:actions:read-bar,baz');

    resp = await helper.apiClient.githubRepoToken('testapp', 'testuser', {
      repositories: ['bar', 'baz'],
      permissions: { contents: 'write', actions: 'read' },
    });
    assert.equal(resp.token, 'token-67890-contents:write:actions:read-bar,baz');
  });

  test('Requesting a token on an app with no access to a repo 400s', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'notonrepo', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InputError' && err.statusCode === 400
    );
  });

  test('Requesting a token on a rate limited app forwards as a 429', async () => {
    const limitedOwners = [
      'ratelimited',
      'primarylimited',
      'secondarylimited',
      'secondarylimitednoheader',
      'lookuplimited',
      'lookupsecondarylimited',
    ];

    for (const ownerName of limitedOwners) {
      await assert.rejects(
        () =>
          helper.apiClient.githubRepoToken('testapp', ownerName, {
            repositories: ['bar'],
            permissions: { contents: 'read' },
          }),
        err => err.code === 'TooManyRequests' && err.statusCode === 429
      );
    }
  });

  test('A normal 403 is not forwarded as a 429', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'forbidden', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InternalServerError' && err.statusCode === 500
    );

    const monitor = await helper.load('monitor');
    assert.equal(
      monitor.manager.messages.filter(({ Type, Fields }) => Type === 'monitor.error' && Fields.status === 403).length,
      1
    );
    monitor.manager.reset();
  });

  test('The installation lookup is cached across requests', async () => {
    const getToken = owner =>
      helper.apiClient.githubRepoToken('testapp', owner, {
        repositories: ['bar'],
        permissions: { contents: 'read' },
      });

    await getToken('testorg');
    await getToken('TestOrg');
    assert.equal(helper.installationLookups, 1);

    await getToken('testuser');
    assert.equal(helper.installationLookups, 3); // the user lookup falls back from the org one
  });

  test('A cached installation that got removed is looked up again', async () => {
    const getToken = () =>
      helper.apiClient.githubRepoToken('testapp', 'testorg', {
        repositories: ['bar'],
        permissions: { contents: 'read' },
      });

    await getToken();
    assert.equal(helper.installationLookups, 1);

    helper.githubUninstalled.add(12345);
    await assert.rejects(getToken, err => err.code === 'ResourceNotFound' && err.statusCode === 404);

    helper.githubUninstalled.delete(12345);
    await getToken();
    assert.equal(helper.installationLookups, 2);
  });

  test('An installation reporting no owner is rejected', async () => {
    await assert.rejects(
      () =>
        helper.apiClient.githubRepoToken('testapp', 'noowner', {
          repositories: ['bar'],
          permissions: { contents: 'read' },
        }),
      err => err.code === 'InputError' && err.statusCode === 400
    );
  });
});
