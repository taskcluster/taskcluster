suite('api (role logic)', function() {
  var Promise     = require('promise');
  var helper      = require('./helper');
  var _           = require('lodash');
  var assume      = require('assume');
  var taskcluster = require('taskcluster-client');
  var mocha       = require('mocha');

  if (!helper.hasPulseCredentials()) {
    setup(function() {
      this.skip();
    });
  }

  /**
   * Customized test function, taking an object as follows:
   * test('...', {
   *   roles: [       // roles to create (will be deleted before the test)
   *     {
   *       roleId: 'assume:thing-id:*'
   *       scopes: [...]
   *     },
   *   ],
   *   clients: [    // clients to create (will be deleted before the test)
   *     {
   *       clientId: '...'
   *       includes: [...], // test that client has these scopes
   *       excludes: [...]  // test that client doesn't have these scopes
   *     }
   *   ],
   * });
   *
   * Due to the nature of these test we can't expect them to work if two
   * instances of these test cases runs at the same time.
   */
  let test = (title, t) => {
    mocha.test(title, async function() {
      // Some of these tests can be a bit slow, especially without in-memory entities
      this.timeout(10 * 60 * 1000);

      // Ensure all roles and clients from the test are deleted
      for (let c of t.clients) {
        await helper.auth.deleteClient(c.clientId);
      }
      for (let r of t.roles) {
        await helper.auth.deleteRole(r.roleId);
      }

      // Create all roles and clients
      for (let c of t.clients) {
        await helper.auth.createClient(c.clientId, {
          description:  'client for test case: ' + title,
          expires:      taskcluster.fromNowJSON('2 hours'),
          scopes:       c.scopes,
        });
      }
      for (let r of t.roles) {
        await helper.auth.createRole(r.roleId, {
          description:  'role for test case: ' + title,
          scopes:       r.scopes,
        });
      }

      // Run tests for all clients
      let err = '';
      await Promise.all(t.clients.map(async (c) => {
        let client = await helper.auth.client(c.clientId);
        let missing = _.difference(c.includes, client.expandedScopes);
        let forbidden = _.intersection(c.exludes, client.expandedScopes);
        if (missing.length !== 0 || forbidden.length !== 0) {
          err += 'Test failed: ' + JSON.stringify(t, null, 2) + '\n';
          err += 'Client: ' + JSON.stringify(client, null, 2) + '\n';
        }
        if (missing.length !== 0) {
          err += 'Missing: ' + JSON.stringify(missing) + '\n';
        }
        if (forbidden.length !== 0) {
          err += 'Forbidden: ' + JSON.stringify(forbidden) + '\n';
        }
        if (missing.length !== 0 || forbidden.length !== 0) {
          err += '\n\n';
        }
      }));

      // delete all roles and clients from the tests
      for (let c of t.clients) {
        await helper.auth.deleteClient(c.clientId);
      }
      for (let r of t.roles) {
        await helper.auth.deleteRole(r.roleId);
      }

      if (err !== '') {
        throw new Error(err);
      }
    });
  };

  test('assume:thing-id:* works', {
    roles: [
      {
        roleId: 'thing-id:*',
        scopes: ['test-scope-1'],
      },
    ],
    clients: [
      {
        clientId:   'test-client',
        scopes: [
          'assume:thing-id:test',
        ],
        includes: [
          'assume:thing-id:test',
          'test-scope-1',
        ],
        excludes: [
          'assume:thing-id:*',
          '*',
        ],
      },
    ],
  });

  test('can get *', {
    roles: [
      {
        roleId: 'thing-id:test',
        scopes: ['*'],
      },
    ],
    clients: [
      {
        clientId:   'test-client',
        scopes: [
          'assume:thing-id:test',
        ],
        includes: [
          '*',
        ],
        excludes: [
          'assume:thing-id:test', // should be compressed away
        ],
      },
    ],
  });

  test('two clients don\'t get the same .. uh, look, something shiny!', {
    roles: [
      {
        roleId: 'thing-id:test-client-1',
        scopes: ['scope-1'],
      }, {
        roleId: 'thing-id:test-client-2',
        scopes: ['scope-2'],
      }, {
        roleId: 'thing-id:test-client-*',
        scopes: ['scope-for-both'],
      }, {
        roleId: 'thing-id:other-client',
        scopes: ['other-scope'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:thing-id:test-client-1',
        ],
        includes: [
          'assume:thing-id:test-client-1',
          'scope-1',
          'scope-for-both',
        ],
        excludes: [
          'assume:thing-id:test-client-2',
          'scope-2',
          'other-scope',
          'thing-id:test-client-*',
        ],
      }, {
        clientId:   'test-client-2',
        scopes: [
          'assume:thing-id:test-client-2',
        ],
        includes: [
          'scope-2',
          'scope-for-both',
        ],
        excludes: [
          'scope-1',
          'other-scope',
          'thing-id:test-client-*',
        ],
      }, {
        clientId:   'other-client',
        scopes: [
          'assume:thing-id:other-client',
        ],
        includes: [
          'other-scope',
        ],
        excludes: [
          'scope-for-both',
          'scope-1',
          'scope-2',
          'thing-id:test-client-*',
        ],
      },
    ],
  });

  test('two clients with two prefix roles', {
    roles: [
      {
        roleId: 'test-role-abc*',
        scopes: ['scope-1'],
      }, {
        roleId: 'test-role-abc-*',
        scopes: ['scope-2'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-abc',
        scopes: [
          'assume:test-role-abc',
        ],
        includes: [
          'scope-1',
        ],
        excludes: [
          'scope-2',
        ],
      }, {
        clientId:   'test-client-abc-again',
        scopes: [
          'assume:test-role-abc-again',
        ],
        includes: [
          'scope-1',
          'scope-2',
        ],
        excludes: ['*'],
      },
    ],
  });

  test('indirect roles works', {
    roles: [
      {
        roleId: 'test-client-1',
        scopes: ['assume:test-role'],
      }, {
        roleId: 'test-role',
        scopes: ['special-scope'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-client-1',
        ],
        includes: [
          'assume:test-role',
          'special-scope',
        ],
        excludes: ['*'],
      },
    ],
  });

  test('indirect roles works (with many levels of indirection)', {
    roles: [
      {
        roleId: 'test-role-1',
        scopes: ['assume:test-role-2'],
      }, {
        roleId: 'test-role-2',
        scopes: ['assume:test-role-3'],
      }, {
        roleId: 'test-role-3',
        scopes: ['assume:test-role-4'],
      }, {
        roleId: 'test-role-4',
        scopes: ['assume:test-role-5'],
      }, {
        roleId: 'test-role-5',
        scopes: ['assume:test-role-6'],
      }, {
        roleId: 'test-role-6',
        scopes: ['assume:test-role-7'],
      }, {
        roleId: 'test-role-7',
        scopes: ['assume:test-role-8'],
      }, {
        roleId: 'test-role-8',
        scopes: ['assume:test-role-9'],
      }, {
        roleId: 'test-role-9',
        scopes: ['assume:test-role'],
      }, {
        roleId: 'test-role',
        scopes: ['special-scope'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-role-1',
        ],
        includes: [
          'assume:test-role',
          'assume:test-role-1',
          'assume:test-role-2',
          'assume:test-role-3',
          'assume:test-role-4',
          'assume:test-role-5',
          'assume:test-role-6',
          'assume:test-role-7',
          'assume:test-role-8',
          'assume:test-role-9',
          'special-scope',
        ],
        excludes: ['*'],
      },
    ],
  });

  test('a client using a parameterized role', {
    roles: [
      {
        roleId: 'project-admin:*',
        scopes: ['assume:admin-role:project-<..>/*', 'secrets:get:project/<..>/*'],
      }, {
        roleId: 'admin-role:*',
        scopes: [
          'auth:create-role:<..>',
          'auth:update-role:<..>',
          'auth:delete-role:<..>',
        ],
      },
    ],
    clients: [
      {
        clientId:   'single-admin',
        scopes: [
          'assume:project-admin:proj1',
        ],
        includes: [
          'auth:create-role:project-proj1/*',
        ],
        excludes: [
          'auth:create-role:project-*',
        ],
      }, {
        clientId:   'double-admin',
        scopes: [
          'assume:project-admin:proj1',
          'assume:project-admin:proj2',
        ],
        includes: [
          'auth:create-role:project-proj1/*',
          'auth:create-role:project-proj2/*',
        ],
        excludes: [
          'auth:create-role:project-*',
        ],
      }, {
        clientId:   'star-admin',
        scopes: [
          'assume:project-admin:proj*',
        ],
        includes: [
          'auth:create-role:project-proj*', // note no slash
        ],
        excludes: [
          'auth:create-role:project-*',
        ],
      },
    ],
  });

  const N = 50;
  test('indirect roles works (with ' + N + ' roles)', {
    roles: [
      {
        roleId: 'big-test-client',
        scopes: ['assume:test-role-0'],
      }, {
        roleId: 'test-role-' + N,
        scopes: ['special-scope'],
      },
    ].concat(_.range(N).map(i => {
      return {
        roleId: 'test-role-' + i,
        scopes: ['assume:test-role-' + (i + 1)],
      };
    })),
    clients: [
      {
        clientId:   'big-test-client',
        scopes: [
          'assume:big-test-client',
        ],
        includes: [
          'special-scope',
        ].concat(_.range(N + 1).map(i => 'assume:test-role-' + i)),
        excludes: ['*'],
      },
    ],
  }); //*/

  const M = 5;  // depth
  const K = 50; // multiplier
  test('test with depth = ' + M + ' x ' + K, {
    roles: _.flatten([
      _.flatten(_.range(K).map(k => {
        return _.flatten(_.range(M).map(m => {
          return {
            roleId: 'k-' + k + '-' + m,
            scopes: ['assume:k-' + k + '-' + (m + 1)],
          };
        }));
      })),
      _.range(K).map(k => {
        return {
          roleId: 'k-' + k + '-' + M,
          scopes: ['special-scope'],
        };
      }),
    ]),
    clients: [
      {
        clientId: 'c',
        scopes: ['assume:k-2-0'],
        includes: [
          'special-scope',
        ].concat(_.range(M + 1).map(i => 'assume:k-2-' + i)),
        excludes: ['*'],
      },
    ],
  });

  test('cyclic roles', {
    roles: [
      {
        roleId: 'test-client-1',
        scopes: ['assume:test-role'],
      }, {
        roleId: 'test-role',
        scopes: ['special-scope', 'assume:test-client-1'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-client-1',
        ],
        includes: [
          'assume:test-role',
          'special-scope',
        ],
        excludes: ['*'],
      },
    ],
  });

  test('a* scope is *', {
    roles: [
      {
        roleId: 'test-client-1',
        scopes: ['a*'],
      },
      {
        roleId: 'star',
        scopes: ['*'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-client-1',
        ],
        includes: [
          '*',       // because assume:star is granted
        ],
        excludes: [
          'scope-1', 'scope-2',
        ],
      },
    ],
  });

  test('assume* scope is *', {
    roles: [
      {
        roleId: 'test-client-1',
        scopes: ['assume*'],
      },
      {
        roleId: 'star',
        scopes: ['*'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-client-1',
        ],
        includes: [
          '*',       // because assume:star is granted
        ],
        excludes: [
          'scope-1', 'scope-2',
        ],
      },
    ],
  });

  test('assume:* scope is *', {
    roles: [
      {
        roleId: 'test-client-1',
        scopes: ['assume:*'],
      },
      {
        roleId: 'star',
        scopes: ['*'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-client-1',
        ],
        includes: [
          '*',       // because assume:star is granted
        ],
        excludes: [
          'scope-1', 'scope-2',
        ],
      },
    ],
  });

  test('assume:client-* scope is *', {
    roles: [
      {
        roleId: 'test-client-1',
        scopes: ['assume:st*'],
      },
      {
        roleId: 'star',
        scopes: ['*'],
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        scopes: [
          'assume:test-client-1',
        ],
        includes: [
          '*',       // because assume:star is granted
        ],
        excludes: [
          'scope-1', 'scope-2',
        ],
      },
    ],
  });

  //*/
});
