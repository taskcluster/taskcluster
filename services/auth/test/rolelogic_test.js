suite('api (role logic)', function() {
  var Promise     = require('promise');
  var assert      = require('assert');
  var debug       = require('debug')('test:roles');
  var helper      = require('./helper');
  var slugid      = require('slugid');
  var _           = require('lodash');
  var assume      = require('assume');
  var base        = require('taskcluster-base');
  var taskcluster = require('taskcluster-client');
  var mocha       = require('mocha');

  /**
   * Customized test function, taking an object as follows:
   * test('...', {
   *   roles: [       // roles to create (will be deleted before the test)
   *     {
   *       roleId: 'assume:client-id:*'
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
      // Some of these tests can be a bit slow...
      this.timeout(5 * 60 * 1000);

      // Ensure all roles and clients from the test are deleted
      for(let c of t.clients) {
        await helper.auth.deleteClient(c.clientId);
      }
      for (let r of t.roles) {
        await helper.auth.deleteRole(r.roleId);
      }

      // Create all roles and clients
      for(let c of t.clients) {
        await helper.auth.createClient(c.clientId, {
          description:  'client for test case: ' + title,
          expires:      taskcluster.fromNowJSON('2 hours')
        });
      }
      for (let r of t.roles) {
        await helper.auth.createRole(r.roleId, {
          description:  'role for test case: ' + title,
          scopes:       r.scopes
        });
      }

      // Run tests for all clients
      let err = '';
      await Promise.all(t.clients.map(async (c) => {
        let client = await helper.auth.client(c.clientId);
        let missing = _.difference(c.includes, client.expandedScopes);
        let forbidden = _.intersection(c.exludes, client.expandedScopes);
        if (missing.length !== 0 || forbidden.length !== 0) {
          err += "Test failed: " + JSON.stringify(t, null, 2) + '\n';
          err += "Client: " + JSON.stringify(client, null, 2) + '\n';
        }
        if (missing.length !== 0) {
          err += "Missing: " + JSON.stringify(missing) + '\n';
        }
        if (forbidden.length !== 0) {
          err += "Forbidden: " + JSON.stringify(forbidden) + '\n';
        }
        if (missing.length !== 0 || forbidden.length !== 0) {
          err += '\n\n';
        }
      }));

      // delete all roles and clients from the tests
      for(let c of t.clients) {
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


  test("assume:client-id:* works", {
    roles: [
      {
        roleId: 'client-id:*',
        scopes: ['test-scope-1']
      },
    ],
    clients: [
      {
        clientId:   'test-client',
        includes: [
          'test-scope-1'
        ],
        excludes: [
          '*',
          'assume:client-id:*'
        ]
      }
    ],
  });


  test("can get *", {
    roles: [
      {
        roleId: 'client-id:test-client',
        scopes: ['*']
      },
    ],
    clients: [
      {
        clientId:   'test-client',
        includes: [
          '*'
        ],
        excludes: [
          'assume:client-id:test-client' // should be compressed away
        ]
      }
    ],
  });


  test("two clients don't get the same", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['scope-1']
      }, {
        roleId: 'client-id:test-client-2',
        scopes: ['scope-2']
      }, {
        roleId: 'client-id:test-client-*',
        scopes: ['scope-for-both']
      }, {
        roleId: 'client-id:other-client',
        scopes: ['other-scope']
      },
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          'assume:client-id:test-client-1',
          'scope-1',
          'scope-for-both'
        ],
        excludes: [
          'assume:client-id:test-client-2',
          'scope-2',
          'other-scope',
          'client-id:test-client-*'
        ]
      }, {
        clientId:   'test-client-2',
        includes: [
          'scope-2',
          'scope-for-both'
        ],
        excludes: [
          'scope-1',
          'other-scope',
          'client-id:test-client-*'
        ]
      }, {
        clientId:   'other-client',
        includes: [
          'other-scope'
        ],
        excludes: [
          'scope-for-both',
          'scope-1',
          'scope-2',
          'client-id:test-client-*'
        ]
      }
    ],
  });


  test("two clients with two prefix roles", {
    roles: [
      {
        roleId: 'client-id:test-client-abc*',
        scopes: ['scope-1']
      }, {
        roleId: 'client-id:test-client-abc-*',
        scopes: ['scope-2']
      }
    ],
    clients: [
      {
        clientId:   'test-client-abc',
        includes: [
          'scope-1',
        ],
        excludes: [
          'scope-2',
        ]
      }, {
        clientId:   'test-client-abc-again',
        includes: [
          'scope-1',
          'scope-2',
        ],
        excludes: ['*']
      }
    ],
  });


  test("indirect roles works", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['assume:test-role']
      }, {
        roleId: 'test-role',
        scopes: ['special-scope']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          'assume:test-role',
          'special-scope'
        ],
        excludes: ['*']
      }
    ],
  });


  test("indirect roles works (with many levels of indirection)", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['assume:test-role-1']
      }, {
        roleId: 'test-role-1',
        scopes: ['assume:test-role-2']
      }, {
        roleId: 'test-role-2',
        scopes: ['assume:test-role-3']
      }, {
        roleId: 'test-role-3',
        scopes: ['assume:test-role-4']
      }, {
        roleId: 'test-role-4',
        scopes: ['assume:test-role-5']
      }, {
        roleId: 'test-role-5',
        scopes: ['assume:test-role-6']
      }, {
        roleId: 'test-role-6',
        scopes: ['assume:test-role-7']
      }, {
        roleId: 'test-role-7',
        scopes: ['assume:test-role-8']
      }, {
        roleId: 'test-role-8',
        scopes: ['assume:test-role-9']
      }, {
        roleId: 'test-role-9',
        scopes: ['assume:test-role']
      }, {
        roleId: 'test-role',
        scopes: ['special-scope']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
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
          'special-scope'
        ],
        excludes: ['*']
      }
    ],
  }); // */

  const N = 50;
  test("indirect roles works (with " + N + " roles)", {
    roles: [
      {
        roleId: 'client-id:big-test-client',
        scopes: ['assume:test-role-0']
      }, {
        roleId: 'test-role-' + N,
        scopes: ['special-scope']
      }
    ].concat(_.range(N).map(i => {
      return {
        roleId: 'test-role-' + i,
        scopes: ['assume:test-role-' + (i + 1)]
      };
    })),
    clients: [
      {
        clientId:   'big-test-client',
        includes: [
          'special-scope'
        ].concat(_.range(N + 1).map(i => 'assume:test-role-' + i)),
        excludes: ['*']
      }
    ],
  }); //*/

  const M = 5;  // depth
  const K = 50; // multiplier
  test('test with depth = ' + M + " x " + K, {
    roles: _.flatten([
      _.flatten(_.range(K).map(k => {
        return _.flatten(_.range(M).map(m => {
          return {
            roleId: 'k-' + k + '-' + m,
            scopes: ['assume:k-' + k + '-' + (m + 1)]
          };
        }));
      })),
      _.range(K).map(k => {
        return {
          roleId: 'k-' + k + '-' + M,
          scopes: ['special-scope']
        };
      }),
      [{
        roleId: 'client-id:c',
        scopes: ['assume:k-2-0']
      }]
    ]),
    clients: [
      {
        clientId: 'c',
        includes: [
          'special-scope'
        ].concat(_.range(M + 1).map(i => 'assume:k-2-' + i)),
        excludes: ['*']
      }
    ]
  });


  test("cyclic roles", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['assume:test-role']
      }, {
        roleId: 'test-role',
        scopes: ['special-scope', 'assume:client-id:test-client-1']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          'assume:test-role',
          'special-scope'
        ],
        excludes: ['*']
      }
    ],
  });


  test("a* scope is *", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['a*']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          '*'       // because assume:client-id:root is granted
        ],
        excludes: [
          'scope-1', 'scope-2'
        ]
      }
    ],
  });

  test("assume* scope is *", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['assume*']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          '*'       // because assume:client-id:root is granted
        ],
        excludes: [
          'scope-1', 'scope-2'
        ]
      }
    ],
  });

  test("assume:* scope is *", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['assume:*']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          '*'       // because assume:client-id:root is granted
        ],
        excludes: [
          'scope-1', 'scope-2'
        ]
      }
    ],
  });

  test("assume:client-* scope is *", {
    roles: [
      {
        roleId: 'client-id:test-client-1',
        scopes: ['assume:client-*']
      }
    ],
    clients: [
      {
        clientId:   'test-client-1',
        includes: [
          '*'       // because assume:client-id:root is granted
        ],
        excludes: [
          'scope-1', 'scope-2'
        ]
      }
    ],
  });

  //*/
});