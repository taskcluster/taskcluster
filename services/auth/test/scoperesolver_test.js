const helper = require('./helper');
const ScopeResolver = require('../src/scoperesolver');
const exchanges = require('../src/exchanges');
const {mergeScopeSets, scopeCompare} = require('taskcluster-lib-scopes');
const Monitor = require('taskcluster-lib-monitor');
const assert = require('assert');
const _ = require('lodash');
const fs = require('fs');
const assume = require('assume');

suite(helper.suiteName(__filename), () => {
  let monitor, scopeResolver;
  setup(async () => {
    monitor = new Monitor({projectName: 'mock-auth', mock: true});
    scopeResolver = new ScopeResolver({monitor, disableCache: true});
  });
  teardown(() => {
    monitor.terminate();
  });

  helper.secrets.mockSuite('setup and listening', ['app', 'azure'], function(mock, skipping) {
    helper.withEntities(mock, skipping);
    helper.withRoles(mock, skipping);
    helper.withPulse(mock, skipping);
    let reloads = [];

    setup('mock scoperesolver reloading', async function() {
      reloads = [];

      scopeResolver.reload = () => reloads.push('all');
      scopeResolver.reloadClient = (clientId) => reloads.push(clientId);
      scopeResolver.reloadRoles = () => reloads.push('roles');

      const pulseClient = await helper.load('pulseClient');
      await scopeResolver.setup({
        rootUrl: helper.rootUrl,
        Client: helper.Client,
        Roles: helper.Roles,
        pulseClient,
        exchangeReference: exchanges.reference(),
      });
      assume(reloads).to.deeply.equal(['all']);
      reloads = [];
    });

    test('client messages reload specific clients', async function() {
      await scopeResolver._clientPq.fakeMessage({payload: {clientId: 'clid'}});
      assume(reloads).to.deeply.equal(['clid']);
    });

    test('reconnection reloads everything', async function() {
      await scopeResolver._clientPq.connected();
      assume(reloads).to.deeply.equal(['all']);
    });

    test('role messages reload all roles', async function() {
      await scopeResolver._rolePq.fakeMessage({payload: {}});
      assume(reloads).to.deeply.equal(['roles']);
    });
  });

  suite('buildResolver', function() {
    const testResolver = (title, {roles, scopes, expected}) => {
      test(title, function() {
        const resolver = scopeResolver.buildResolver(roles);
        expected.sort(scopeCompare);
        assume(resolver(scopes)).eql(expected);
      });
    };

    testResolver('scopes pass through', {
      roles: [],
      scopes: ['a', 'b', 'c*'],
      expected: ['a', 'b', 'c*'],
    });

    testResolver('passed through scopes are normalized', {
      roles: [],
      scopes: ['a*', 'ab', 'ac*', 'a'],
      expected: ['a*'],
    });

    testResolver('assume:a* matches, a, aa, ab, a*', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'aa', scopes: ['AA']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'a*', scopes: ['ASTAR']},
      ],
      scopes: ['assume:a*'],
      expected: ['assume:a*', 'A', 'AA', 'AB', 'ASTAR'],
    });

    testResolver('ab* matches ab, abc', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
      ],
      scopes: ['assume:ab*'],
      expected: ['assume:ab*', 'AB', 'ABC'],
    });

    testResolver('a gets a*', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'ab*', scopes: ['ABSTAR']},
      ],
      scopes: ['assume:a'],
      expected: ['assume:a', 'ASTAR'],
    });

    testResolver('max sets (with long scopes)', {
      roles: [
        {roleId: 'ab*', scopes: ['ABSTAR']},
        {roleId: 'aaaaaaaaaaaaa', scopes: ['long']},
        {roleId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', scopes: ['longer']},
        {roleId: 'ababaabdssafsdcsdcsacwscwcscsesdsdfdsfdsfsdfsfdsdfsdfsdfsafewfsewfwsd', scopes: ['longest']},
      ],
      scopes: ['assume:ab*'],
      expected: ['assume:ab*', 'ABSTAR', 'longest'],
    });

    testResolver('ab gets ab*, a*', {
      roles: [
        {roleId: 'ab*', scopes: ['ABSTAR']},
        {roleId: 'a*', scopes: ['ASTAR']},
      ],
      scopes: ['assume:ab'],
      expected: ['assume:ab', 'ABSTAR', 'ASTAR'],
    });

    testResolver('a gets * and a', {
      roles: [
        {roleId: '*', scopes: ['STAR']},
        {roleId: 'a*', scopes: ['ASTAR']},
      ],
      scopes: ['assume:a'],
      expected: ['assume:a', 'STAR', 'ASTAR'],
    });

    testResolver('a*, b*, c*', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'ab*', scopes: ['ABSTAR']},
        {roleId: 'ac*', scopes: ['ACSTAR']},
        {roleId: 'd', scopes: ['D']},
      ],
      scopes: ['assume:ab'],
      expected: ['assume:ab', 'ASTAR', 'ABSTAR'],
    });

    testResolver('ab* matches a*', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'aabc', scopes: ['AABC']},
      ],
      scopes: ['assume:aa*'],
      expected: ['assume:aa*', 'ASTAR', 'AABC'],
    });

    testResolver('* get all', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'b', scopes: ['B']},
        {roleId: 'c', scopes: ['C']},
      ],
      scopes: ['*'],
      expected: ['*'],
    });

    testResolver('a* get all', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'b', scopes: ['B']},
        {roleId: 'c', scopes: ['C']},
      ],
      scopes: ['a*'],
      expected: ['a*', 'A', 'B', 'C'],
    });

    testResolver('assume* get all', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'b', scopes: ['B']},
        {roleId: 'c', scopes: ['C']},
      ],
      scopes: ['assume*'],
      expected: ['assume*', 'A', 'B', 'C'],
    });

    testResolver('assume:* get all', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'b', scopes: ['B']},
        {roleId: 'c', scopes: ['C']},
      ],
      scopes: ['assume:*'],
      expected: ['assume:*', 'A', 'B', 'C'],
    });

    testResolver('assum* get all', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'b', scopes: ['B']},
        {roleId: 'c', scopes: ['C']},
      ],
      scopes: ['assum*'],
      expected: ['assum*', 'A', 'B', 'C'],
    });

    testResolver('assume:a works', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'b', scopes: ['B']},
        {roleId: 'c', scopes: ['C']},
      ],
      scopes: ['assume:a'],
      expected: ['assume:a', 'A'],
    });

    testResolver('exact match ab', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
      ],
      scopes: ['assume:ab'],
      expected: ['assume:ab', 'AB'],
    });

    testResolver('ab* matches ab, abc', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
      ],
      scopes: ['assume:ab*'],
      expected: ['assume:ab*', 'AB', 'ABC'],
    });

    testResolver('ab* matches a*', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
      ],
      scopes: ['assume:ab*'],
      expected: ['assume:ab*', 'ASTAR', 'AB', 'ABC'],
    });

    testResolver('ab match ab,a*', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
      ],
      scopes: ['assume:ab'],
      expected: ['assume:ab', 'ASTAR', 'AB'],
    });

    testResolver('a*b* matches a*b, a*bc', {
      roles: [
        {roleId: 'a', scopes: ['A']},
        {roleId: 'a*b', scopes: ['ASTARB']},
        {roleId: 'a*bc', scopes: ['ASTARBC']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
        {roleId: 'b*', scopes: ['BSTAR']},
        {roleId: 'c*', scopes: ['CSTAR']},
        {roleId: 'ab*', scopes: ['ABSTAR']},
      ],
      scopes: ['assume:a*b*'],
      expected: ['assume:a*b*', 'ASTARB', 'ASTARBC'],
    });

    testResolver('a*b matches a*, a*b', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'a*b', scopes: ['ASTARB']},
        {roleId: 'a*bc', scopes: ['ASTARBC']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
        {roleId: 'b*', scopes: ['BSTAR']},
        {roleId: 'c*', scopes: ['CSTAR']},
        {roleId: 'ab*', scopes: ['ABSTAR']},
      ],
      scopes: ['assume:a*b'],
      expected: ['assume:a*b', 'ASTARB', 'ASTAR'],
    });

    testResolver('a*b* matches a*b, a*bc', {
      roles: [
        {roleId: 'a*', scopes: ['ASTAR']},
        {roleId: 'a*b', scopes: ['ASTARB']},
        {roleId: 'a*bc', scopes: ['ASTARBC']},
        {roleId: 'ab', scopes: ['AB']},
        {roleId: 'abc', scopes: ['ABC']},
        {roleId: 'b*', scopes: ['BSTAR']},
        {roleId: 'c*', scopes: ['CSTAR']},
        {roleId: 'ab*', scopes: ['ABSTAR']},
      ],
      scopes: ['assume:a*b*'],
      expected: ['assume:a*b*', 'ASTARB', 'ASTARBC', 'ASTAR'],
    });

    testResolver('basic parameterized role', {
      roles: [
        {roleId: 'a*', scopes: ['A<..>']},
      ],
      scopes: ['assume:abc'],
      expected: ['assume:abc', 'Abc'],
    });

    testResolver('basic parameterized role, matched with *', {
      roles: [
        {roleId: 'a*', scopes: ['A<..>']},
      ],
      scopes: ['assume:abc*'],
      expected: ['assume:abc*', 'Abc*'],
    });

    testResolver('parameterized role with suffix', {
      roles: [
        {roleId: 'a*', scopes: ['A<..>X']},
      ],
      scopes: ['assume:abc'],
      expected: ['assume:abc', 'AbcX'],
    });

    testResolver('parameterized role with suffix, matched with *', {
      roles: [
        {roleId: 'a*', scopes: ['A<..>X']},
      ],
      scopes: ['assume:abc*'],
      expected: ['assume:abc*', 'Abc*'],
    });

    testResolver('parameterized role with suffix, matched with a shorter *', {
      roles: [
        {roleId: 'abc*', scopes: ['ABC<..>DEF']},
      ],
      scopes: ['assume:a*'],
      expected: ['assume:a*', 'ABC*'],
    });
  });

  suite('performance', function() {
    const shouldMeasure = process.env.MEASURE_PERFORMANCE;
    let time;
    if (shouldMeasure) {
      // this could take a while..
      this.slow(3600000);
      this.timeout(0);

      const MIN_ITERATIONS = 5; // during warmup only
      const PREHEAT_TIME = 500 * 1000000; // ns
      const TIMEING_TIME = 2 * 1000000000; // ns
      time = (step, fn) => {
        let result;
        let mean;
        let count = 0;
        // initial runs to skip (allows JIT warmup)
        // we also use this to estimate how many iterations we need to run
        // inorder to do timing for TIMEING_TIME time.
        const preheat = process.hrtime();
        while (true) {
          for (let i = 0; i < MIN_ITERATIONS; i++) {
            result = fn();
          }
          count += 1;
          const diff = process.hrtime(preheat);
          if (diff[0] * 1000000000 + diff[1] > PREHEAT_TIME) {
            mean = (diff[0] * 1000000000 + diff[1]) / (MIN_ITERATIONS * count);
            break;
          }
        }
        // Estimate iterations to measure and run them
        let iterations = Math.ceil(TIMEING_TIME / mean);
        const start = process.hrtime();
        for (let i = 0; i < iterations; i++) {
          result = fn();
        }
        const diff = process.hrtime(start);
        mean = (diff[0] * 1000000000 + diff[1]) / iterations;

        let unit = 'ns';
        if (mean > 1000) {
          mean /= 1000;
          unit = 'μs';
        }
        if (mean > 1000) {
          mean /= 1000;
          unit = 'ms';
        }
        console.log(`${step}: ${mean.toFixed(2)} ${unit}`);
        return result;
      };
    } else {
      time = (step, fn) => fn();
    }

    const testResolver = (title, {roles, scopes, expected}) => {
      test(title, function() {
        let resolver = time('setup', () => scopeResolver.buildResolver(roles));
        let result = time('execute', () => resolver(scopes));
        if (expected) {
          expected.sort(scopeCompare);
          assert.deepEqual(expected, resolver(scopes));
        }
      });
    };

    // test a chain of N roles, each one leading to the next
    // ch-1 -> ... -> assume:ch-N -> special-scope
    const testChain = N => {
      testResolver(`chain of ${N} roles`, {
        roles: _.range(N).map(i => ({roleId: `ch-${i}`, scopes: [`assume:ch-${i+1}`]})).concat([
          {roleId: `ch-${N}`, scopes: ['special-scope']},
        ]),
        scopes: ['assume:ch-0'],
        expected: _.range(N).map(i => `assume:ch-${i}`).concat([
          `assume:ch-${N}`,
          'special-scope',
        ]),
      });
    };

    testChain(500);
    if (shouldMeasure) {
      testChain(750);
      testChain(1000);
      testChain(1250);
      testChain(1500);
    }

    // test a tree of roles H roles deep, with each row growing by W
    // t ---> t-1 ---> t-1-1 ---> ... t-1-1-1-1-1
    //        t-2 ..   t-1-2            \---H---/
    //        ..       ..
    //        t-W ..
    const testTree = (W, H) => {
      const roles = [];
      const recur = (prefix, h) => {
        const roleIds = _.range(W).map(w => `${prefix}-${w}`);
        if (h !== H) {
          roleIds.forEach(roleId => recur(roleId, h+1));
        }
        roles.push({
          roleId: prefix,
          scopes: roleIds.map(roleId => `assume:${roleId}`),
        });
      };
      recur('t', 0);

      testResolver(`tree of ${W}x${H} roles`, {
        roles,
        scopes: ['assume:t'],
        expected: _.flatten(roles.map(r => r.scopes)).concat(['assume:t']),
      });
    };
    testTree(2, 3);
    if (shouldMeasure) {
      testTree(1, 4);
      testTree(2, 4);
      testTree(2, 5);
      testTree(2, 6);
      testTree(3, 3);
      testTree(3, 4);
      testTree(3, 5);
      testTree(4, 4);
    }

    // Test with a snapshot of real roles, captured with
    //   `curl https://auth.taskcluster.net/v1/roles > test/roles.json`
    const realRoles = require('./roles');
    const testRealRoles = (scopes, expected) => {
      testResolver(`real roles with scopes ${scopes.join(', ')}`, {
        roles: realRoles,
        scopes,
        expected,
      });
    };

    testRealRoles(['assume:*'], [
      'assume:*',
      'auth:*',
      'aws-provisioner:*',
      'docker-worker:*',
      'ec2-manager:*',
      'generic-worker:*',
      'github:*',
      'hooks:*',
      'index:*',
      'notify:*',
      'project:*',
      'pulse:*',
      'purge-cache:*',
      'queue:*',
      'scheduler:*',
      'secrets:*',
      'in-tree:*',
      'worker:*',
    ]);

    testRealRoles(['assume:repo:github.com/*']);
    testRealRoles(['assume:worker-type:*']);
    testRealRoles(['assume:mozilla-user:*']);
    testRealRoles(['assume:mozilla-group:team_taskcluster']);
    testRealRoles(['assume:moz-tree:level:3']);

    // curl https://auth.taskcluster.net/v1/clients | jq -r '.clients' > test/clients.json
    const realClients = require('./clients');
    test('resolve all clients', () => {
      const resolver = time('setup', () => scopeResolver.buildResolver(realRoles));
      time('resolve', () => {
        realClients.map(client => resolver(client.scopes));
      });
    });
  });

  suite('validateRoles', () => {
    const validateRoles = (title, roles, errorCode = false) => {
      test(title, () => _.range(100).forEach(() => {
        try {
          ScopeResolver.validateRoles(_.shuffle(roles));
        } catch (e) {
          if (!errorCode) {
            assume(e).not.exists('unexpected error');
          }
          assume(e.code).equals(errorCode, 'unexpected err.code');
          return;
        }
        assume(errorCode).false('expected an error');
      }));
    };

    validateRoles('simple role', [
      {roleId: 'a', scopes: ['A']},
      {roleId: 'b', scopes: ['B']},
      {roleId: 'c', scopes: ['C']},
    ]);

    validateRoles('simple role DAG', [
      {roleId: 'a', scopes: ['assume:c']},
      {roleId: 'b', scopes: ['assume:c']},
      {roleId: 'c', scopes: ['assume:e']},
    ]);

    validateRoles('simple role cycle', [
      {roleId: 'a', scopes: ['assume:c']},
      {roleId: 'b', scopes: ['assume:c']},
      {roleId: 'c', scopes: ['assume:a']},
    ], 'DependencyCycleError');

    validateRoles('simple prefix match role DAG', [
      {roleId: 'a*', scopes: ['assume:c']},
      {roleId: 'b*', scopes: ['assume:c']},
      {roleId: 'c*', scopes: ['assume:e']},
    ]);

    validateRoles('simple prefix match role cycle', [
      {roleId: 'a*', scopes: ['assume:c']},
      {roleId: 'b*', scopes: ['assume:c']},
      {roleId: 'c*', scopes: ['assume:a']},
    ], 'DependencyCycleError');

    validateRoles('simple parameterized role (1)', [
      {roleId: 'a*', scopes: ['assume:b']},
    ]);

    validateRoles('simple parameterized role (2)', [
      {roleId: 'a*', scopes: ['assume:b*']},
    ]);

    validateRoles('simple parameterized role (3)', [
      {roleId: 'a*', scopes: ['assume:b<..>']},
    ]);

    validateRoles('simple parameterized role (4)', [
      {roleId: 'a*', scopes: ['assume:b<..>*']},
    ]);

    validateRoles('simple parameterized role (5)', [
      {roleId: 'a*', scopes: ['assume:b<..>c']},
    ]);

    validateRoles('simple parameterized role (6)', [
      {roleId: 'a*', scopes: ['assume:b<..>c*']},
    ]);

    validateRoles('ambiguous kleene in parameterized role', [
      {roleId: 'a*', scopes: ['assume:b*<..>']},
    ], 'InvalidScopeError');

    validateRoles('double parameter in parameterized role (1)', [
      {roleId: 'a*', scopes: ['assume:b<..>c<..>']},
    ], 'InvalidScopeError');

    validateRoles('double parameter in parameterized role (2)', [
      {roleId: 'a*', scopes: ['assume:b<..><..>']},
    ], 'InvalidScopeError');

    validateRoles('double parameter in parameterized role (3)', [
      {roleId: 'a*', scopes: ['assume:b<..>c<..>d']},
    ], 'InvalidScopeError');

    validateRoles('simple parameterized role DAG', [
      {roleId: 'a*', scopes: ['assume:c<..>A']},
      {roleId: 'b*', scopes: ['assume:c<..>B*']},
      {roleId: 'c*', scopes: ['assume:e<..>']},
    ]);

    validateRoles('simple parameterized role cycle (1)', [
      {roleId: 'a*', scopes: ['assume:c<..>A']},
      {roleId: 'b*', scopes: ['assume:c<..>B*']},
      {roleId: 'c*', scopes: ['assume:a<..>']},
    ], 'DependencyCycleError');

    validateRoles('simple parameterized role cycle (2)', [
      {roleId: 'a*', scopes: ['assume:c<..>A']},
      {roleId: 'b*', scopes: ['assume:c<..>B*']},
      {roleId: 'c*', scopes: ['assume:b<..>']},
    ], 'DependencyCycleError');

    validateRoles('simple parameterized role cycle (3)', [
      {roleId: 'a*', scopes: ['assume:c<..>A']},
      {roleId: 'b*', scopes: ['assume:c<..>B*']},
      {roleId: 'c*', scopes: ['assume:<..>']},
    ], 'DependencyCycleError');

    validateRoles('simple parameterized role cycle (4)', [
      {roleId: 'a*', scopes: ['assume:c<..>A']},
      {roleId: 'b*', scopes: ['assume:c<..>B*']},
      {roleId: 'c*', scopes: ['assume:b']},
    ], 'DependencyCycleError');

    validateRoles('self-referential simple role', [
      {roleId: 'abc', scopes: ['assume:abc']},
    ], 'DependencyCycleError');

    validateRoles('four simple roles, pointing to each other', [
      {roleId: 'abc', scopes: ['assume:def']},
      {roleId: 'def', scopes: ['assume:ghi']},
      {roleId: 'ghi', scopes: ['assume:jkl']},
      {roleId: 'jkl', scopes: ['assume:abcd']},
    ]);

    validateRoles('inter-referential roles among others', [
      {roleId: 'abc', scopes: ['assume:def']},
      {roleId: 'def', scopes: ['assume:ghi']},
      {roleId: 'ghi', scopes: ['assume:xyz']},
      {roleId: 'jkl', scopes: ['assume:xyz']},
    ]);

    validateRoles('no cycles', [
      {roleId: 'abc', scopes: ['assume:xyz']},
      {roleId: 'def', scopes: ['assume:xyz']},
      {roleId: 'ghi', scopes: ['assume:xyz']},
      {roleId: 'jkl', scopes: ['assume:xyz']},
      {roleId: 'xyz', scopes: ['some-scope']},
    ]);

    validateRoles('self-referential role with * in scopes', [
      {roleId: 'abc', scopes: ['assume:ab*']},
    ], 'DependencyCycleError');

    validateRoles('self-referential role with * in roleId', [
      {roleId: 'ab*', scopes: ['assume:abc']},
    ], 'DependencyCycleError');

    validateRoles('self-referential role with * in roleId and scopes', [
      {roleId: 'ab*', scopes: ['assume:abc*']},
    ], 'DependencyCycleError');

    validateRoles('four inter-referential roles with *s', [
      {roleId: 'abc', scopes: ['assume:d*']},
      {roleId: 'def', scopes: ['assume:ghi']},
      {roleId: 'g*', scopes: ['assume:jkl']},
      {roleId: 'jkl', scopes: ['assume:ab']},
    ]);

    validateRoles('cycle containing a single parameterized role with no suffix', [
      {roleId: 'a*', scopes: ['assume:ab<..>']},
    ], 'DependencyCycleError');

    validateRoles('cycle containing a single parameterized role with a suffix', [
      {roleId: 'a*', scopes: ['assume:a<..>x']},
    ], 'DependencyCycleError');

    validateRoles('cycle containing a single parameterized role with a prefix and suffix', [
      {roleId: 'a*', scopes: ['assume:ab<..>x']},
    ], 'DependencyCycleError');

    validateRoles('cycle containing two parameterized roles', [
      {roleId: 'a*', scopes: ['assume:b<..>x']},
      {roleId: 'b*', scopes: ['assume:a<..>']},
    ], 'DependencyCycleError');

    validateRoles('cycle containing two parameterized roles where scope is prefix of role', [
      {roleId: 'a*', scopes: ['assume:b<..>x']},
      {roleId: 'bstuff*', scopes: ['assume:a<..>']},
    ], 'DependencyCycleError');

    validateRoles('cycle containing two parameterized roles where role is prefix of scope', [
      {roleId: 'a*', scopes: ['assume:bstuff<..>x']},
      {roleId: 'b*', scopes: ['assume:a<..>']},
    ], 'DependencyCycleError');

    validateRoles('cycle with a partial appearance of "assume:"', [
      // note that this would actually be stable, since the replacement is shorter, but we still
      // want to forbid this
      {roleId: 'b*', scopes: ['as<..>']},
    ], 'DependencyCycleError');

    validateRoles('roles with some parameters', [
      {roleId: 'bb*', scopes: ['assume:cd<..>']},
      {roleId: 'cde*', scopes: ['assume:de<..>x']},
      {roleId: 'd*', scopes: ['assume:b']},
    ]);

    validateRoles('roles with some parameters but a fixed point', [
      {roleId: 'b*', scopes: ['assume:cd<..>']},
      {roleId: 'cde*', scopes: ['assume:de<..>x']},
      {roleId: 'd*', scopes: ['assume:bx']},
    ], 'DependencyCycleError');
  });

  suite('normalizeScopes', () => {
    // Test cases for normalizeScopes
    [
      {
        scopes: ['*'],
        result: ['*'],
      }, {
        scopes: ['*', 'test'],
        result: ['*'],
      }, {
        scopes: ['*', 'test', 'te*'],
        result: ['*'],
      }, {
        scopes: ['*', 'te*'],
        result: ['*'],
      }, {
        scopes: ['test*', 't*'],
        result: ['t*'],
      }, {
        scopes: ['test*', 'ab*'],
        result: ['test*', 'ab*'],
      }, {
        scopes: ['abc', 'ab*', 'a', 'ab'],
        result: ['ab*', 'a'],
      }, {
        scopes: ['a', 'b', 'c'],
        result: ['a', 'b', 'c'],
      }, {
        scopes: ['ab', 'a', 'abc*'],
        result: ['ab', 'a', 'abc*'],
      }, {
        scopes: ['a*', 'ab', 'a', 'abc*'],
        result: ['a*'],
      },
    ].forEach(({scopes, result}) => {
      test(`normalizeScopes(${scopes.join(', ')})`, () => {
        if (_.xor(ScopeResolver.normalizeScopes(scopes), result).length !== 0) {
          console.error('Expected: ');
          console.error(result);
          console.error('Got: ');
          console.error(ScopeResolver.normalizeScopes(scopes));
          assert(false, 'Expected normalizeScopes(' + scopes.join(', ') +
                        ') === ' + result.join(', '));
        }
      });
    });
  });
});
