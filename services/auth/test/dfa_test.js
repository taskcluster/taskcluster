suite('DFA', () => {
  let ScopeResolver = require('../src/scoperesolver');
  let dfa = require('../src/dfa');
  let assert = require('assert');
  let _ = require('lodash');
  let fs = require('fs');

  suite('role sorting', function() {
    let testSortRoles = ({title, roleIds, sorted}) => {
      title = title || 'sortRolesForDFAGeneration(' + roleIds.join(',') + ')';
      test(title, () => {
        _.range(500).forEach(() => {
          let roles = roleIds.map(i => {return {roleId: i};});
          roles = dfa.sortRolesForDFAGeneration(roles).map(r => r.roleId);
          if (!_.isEqual(roles, sorted)) {
            console.log('Got: ');
            console.log(roles);
            console.log('Expected: ');
            console.log(sorted);
            assert(false, 'Not sorted correctly');
          }
          // shuffle roleIds for next round
          roleIds = _.shuffle(roleIds);
        });
      });
    };

    testSortRoles({
      roleIds: [
        'test-12',
        'test-2',
        'test-11',
        'test-1',
        'test-1*',
        'test-13',
        'test-3',
        'test-10',
        'test-*',
      ],
      sorted: [
        'test-*',
        'test-1*',
        'test-1',
        'test-10',
        'test-11',
        'test-12',
        'test-13',
        'test-2',
        'test-3',
      ],
    });

    testSortRoles({
      roleIds: [
        'test*a',
        'test*b',
        'test*',
        'test',
        'testb',
      ],
      sorted: [
        'test*',
        'test',
        'test*a',
        'test*b',
        'testb',
      ],
    });

    testSortRoles({
      roleIds: ['(', '*', ''],
      sorted: ['*', '', '('],
    });

    testSortRoles({
      roleIds: ['ab(', 'ab*', 'aa'],
      sorted: ['aa', 'ab*', 'ab('],
    });

    const sortedRoleIds = [
      '*', 'a*', 'a', 'aa', 'aaa', 'aab', 'ab', 'abb*', 'abb', 'abbc', 'ca',
      'caa', 'cab*', 'cab', 'cc*',
    ];
    testSortRoles({
      title:  'big list',
      roleIds:  _.shuffle(sortedRoleIds),
      sorted: sortedRoleIds,
    });
  });

  suite('scopeset merging', function() {
    let testMergeScopeSets = (title, {scopesA, scopesB, expected}) => {
      test('mergeScopeSets (' + title + ')', () => {
        _.range(500).forEach(() => {
          let results = dfa.mergeScopeSets(
            dfa.sortScopesForMerge(scopesA),
            dfa.sortScopesForMerge(scopesB)
          );
          if (!_.isEqual(results, expected)) {
            console.log('expected:');
            console.log(expected);
            console.log('got:');
            console.log(results);
            assert(false, 'Expected different result!');
          }
          // Shuffle for next round
          scopesA = _.shuffle(scopesA);
          scopesB = _.shuffle(scopesB);
        });
      });
    };

    testMergeScopeSets('simple sort', {
      scopesA: ['a', 'b', 'c'],
      scopesB: [],
      expected: ['a', 'b', 'c'],
    });

    testMergeScopeSets('simple sort w. star', {
      scopesA: ['a*', 'b', 'c'],
      scopesB: [],
      expected: ['a*', 'b', 'c'],
    });

    testMergeScopeSets('complex sort', {
      scopesA: [
        'assume:tr-0',
        'assume:tr-1',
        'assume:tr-10',
        'assume:tr-2',
        'assume:tr-3',
        'assume:tr-4',
        'assume:tr-5',
        'assume:tr-6',
        'assume:tr-7',
        'assume:tr-8',
        'assume:tr-9',
        'special-scope',
      ],
      scopesB: [],
      expected: [
        'assume:tr-0',
        'assume:tr-1',
        'assume:tr-10',
        'assume:tr-2',
        'assume:tr-3',
        'assume:tr-4',
        'assume:tr-5',
        'assume:tr-6',
        'assume:tr-7',
        'assume:tr-8',
        'assume:tr-9',
        'special-scope',
      ],
    });

    testMergeScopeSets('can normalize', {
      scopesA: ['b*', 'ab', 'aa', 'a', 'a*'],
      scopesB: [],
      expected: ['a*', 'b*'],
    });

    testMergeScopeSets('can normalize', {
      scopesA: ['b*', 'ab', 'aa', 'a*'],
      scopesB: [],
      expected: ['a*', 'b*'],
    });

    testMergeScopeSets('sanity check (1)', {
      scopesA: ['assume:tr-10', 'assume:tr-9', 'special-scope'],
      scopesB: [],
      expected: ['assume:tr-10', 'assume:tr-9', 'special-scope'],
    });

    testMergeScopeSets('sanity check (2)', {
      scopesA: [],
      scopesB: ['assume:tr-10', 'assume:tr-9', 'special-scope'],
      expected: ['assume:tr-10', 'assume:tr-9', 'special-scope'],
    });

    testMergeScopeSets('can normalize two', {
      scopesA: ['b*', 'ab', 'aa', 'a*', 'c', 'ca', 'da*'],
      scopesB: ['b*', 'ab', 'aa', 'a*', 'abc', 'ab*', 'ca', 'daa'],
      expected: ['a*', 'b*', 'c', 'ca', 'da*'],
    });
  });

  suite('buildResolver', function() {
    let testBuildResolver = (title, {
      roleIds, scope, expected, skipShuffle, dump, maxSets, time,
    }) => {
      skipShuffle = true;
      let N = skipShuffle ? 1 : 50;
      test('buildResolver (' + title + ')', () => {
        for (let i = 0; i < N; i++) {
          let roles = roleIds.map(i => {return {roleId: i};});
          if (time) {
            console.time('buildResolver');
          }
          let {resolver, sets} = dfa.buildResolver(_.shuffle(roles));
          if (time) {
            console.timeEnd('buildResolver');
          }

          let resolveSet = (i) => {
            let results = [];
            let resolve = (i) => {
              sets[i].forEach(r => {
                if (typeof r === 'number') {
                  resolve(r);
                } else {
                  results.push(r.roleId);
                }
              });
            };
            resolve(i);
            return results;
          };
          if (time) {
            console.time('resolver(scope) x 10k');
            _.range(10000).forEach(() => resolver(scope));
            console.timeEnd('resolver(scope) x 10k');
          }

          let results = resolveSet(resolver(scope));

          if (dump) {
            let rs = dfa.sortRolesForDFAGeneration(_.cloneDeep(roles));
            let sets = [[]];
            let state = dfa.generateDFA(rs, 0, rs.length, 0, sets, 0);

            console.log(JSON.stringify(state, null, 2));
            for (let i = 0; i < sets.length; i++) {
              let ids = sets[i].map(r => r.roleId || r);
              console.log('raw sets[' + i + '] = ' + JSON.stringify(ids));
            }
            console.log('result: '  + resolver(scope));
          }

          if (_.xor(results, expected).length !== 0) {
            console.log('expected:');
            console.log(expected);
            console.log('got:');
            console.log(results);
            assert(false, 'Expected different result!');
          }

          if (maxSets) {
            assert(sets.length <= maxSets, 'more sets than allowed');
          }

          let resolvedSets = [];
          sets.forEach((set, index) => {
            let resolved = resolveSet(index);
            let unique = _.uniq(resolved);
            if (resolved.length !== unique.length) {
              console.log('Duplicates in set: ' + resolved.join(','));
              console.log('sets[' + index + '] = ' + JSON.stringify(sets[index]));
              assert(false, 'Sets shouldn\'t have dupliates!');
            }
            resolved.sort();
            resolvedSets.forEach((rs, i2) => {
              if (_.isEqual(rs, resolved)) {
                console.log('Duplicated set: ' + resolved.join(','));
                console.log('sets[' + i2 + '] = ' +
                            JSON.stringify(sets[i2]));
                console.log('sets[' + index + '] = ' +
                            JSON.stringify(sets[index]));
                console.log('sets[' + i2 + '] -> ' + JSON.stringify(rs));
                console.log('sets[' + index + '] -> ' + JSON.stringify(resolved));
                assert(false, 'Duplicate sets!!!');
              }
            });
            resolvedSets.push(resolved);
          });

          // shuffle for next round
          roleIds = _.shuffle(roleIds);
        }
      });
    };

    testBuildResolver('a* grants a, aa, ab', {
      roleIds: ['a', 'aa', 'ab'],
      scope: 'assume:a*',
      expected: ['a', 'aa', 'ab'],
    });

    testBuildResolver('ab* matches ab, abc', {
      roleIds: ['a', 'ab', 'abc'],
      scope: 'assume:ab*',
      expected: ['ab', 'abc'],
    });

    testBuildResolver('a*, b*, c*', {
      roleIds: ['a*', 'b*', 'c*', 'd'],
      scope: 'assume:a*',
      expected: ['a*'],
    });

    testBuildResolver('a*, ab*, ac*, d', {
      roleIds: ['a*', 'ab*', 'ac*', 'd'],
      scope: 'assume:a*',
      expected: ['a*', 'ab*', 'ac*'],
      maxSets: 10,
    });

    testBuildResolver('a gets a*', {
      roleIds: ['ab*', 'a*'],
      scope: 'assume:a',
      expected: ['a*'],
    });

    testBuildResolver('max sets (with long scopes)', {
      roleIds: [
        'ab*', 'aaaaaaaaaa*', 'aaaaaaaaaaaaaaaaaaaaaaaaa*',
        'ababaabdssafsdcsdcsacwscwcscsesdsdfdsfdsfsdfsfdsdfsdfsdfsafewfsewfwsd',
      ],
      scope: 'assume:ab*',
      expected: ['ab*',
        'ababaabdssafsdcsdcsacwscwcscsesdsdfdsfdsfsdfsfdsdfsdfsdfsafewfsewfwsd',
      ],
      maxSets: 6,
    });

    testBuildResolver('timing with long scopes', {
      roleIds: [
        'ab*', 'aaaaaaaaaa*', 'aaaaaaaaaaaaaaaaaaaaaaaaa*',
        'ababaabdssafsdcsdcsacwscwcscsesdsdfdsfdsfsdfsfdsdfsdfsdfsafewfsewfwsd',
      ],
      scope: 'assume:ababaabdssafsdcsdcsacwscwcscsesdsdfdsfdsfsdfsfdsdfsdfsdfsa*',
      expected: ['ab*',
        'ababaabdssafsdcsdcsacwscwcscsesdsdfdsfdsfsdfsfdsdfsdfsdfsafewfsewfwsd',
      ],
      maxSets: 6,
      time: true,
    });

    testBuildResolver('ab gets ab*, a*', {
      roleIds: ['ab*', 'a*'],
      scope: 'assume:ab',
      expected: ['ab*', 'a*'],
      maxSets: 4,
    });

    testBuildResolver('a gets * and a', {
      roleIds: ['*', 'a*'],
      scope: 'assume:a',
      expected: ['*', 'a*'],
    });

    testBuildResolver('a*, b*, c*', {
      roleIds: ['a*', 'ab*', 'ac*', 'd'],
      scope: 'assume:ab',
      expected: ['a*', 'ab*'],
      maxSets: 10,
    });

    testBuildResolver('ab* matches a*', {
      roleIds: ['a*', 'aabc'],
      scope: 'assume:aa*',
      expected: ['a*', 'aabc'],
    });

    testBuildResolver('* get all', {
      roleIds: ['a', 'b', 'c'],
      scope: '*',
      expected: ['a', 'b', 'c'],
      maxSets: 5,
    });

    testBuildResolver('a* get all', {
      roleIds: ['a', 'b', 'c'],
      scope: 'a*',
      expected: ['a', 'b', 'c'],
    });

    testBuildResolver('assume* get all', {
      roleIds: ['a', 'b', 'c'],
      scope: 'assume*',
      expected: ['a', 'b', 'c'],
    });

    testBuildResolver('assume:* get all', {
      roleIds: ['a', 'b', 'c'],
      scope: 'assume:*',
      expected: ['a', 'b', 'c'],
    });

    testBuildResolver('assum* get all', {
      roleIds: ['a', 'b', 'c'],
      scope: 'assum*',
      expected: ['a', 'b', 'c'],
    });

    testBuildResolver('assume:a works', {
      roleIds: ['a', 'b', 'c'],
      scope: 'assume:a',
      expected: ['a'],
    });

    testBuildResolver('exact match ab', {
      roleIds: ['a', 'ab', 'abc'],
      scope: 'assume:ab',
      expected: ['ab'],
    });

    testBuildResolver('ab* matches ab, abc', {
      roleIds: ['a', 'ab', 'abc'],
      scope: 'assume:ab*',
      expected: ['ab', 'abc'],
    });

    testBuildResolver('ab* matches a*', {
      roleIds: ['a*', 'ab', 'abc'],
      scope: 'assume:ab*',
      expected: ['a*', 'ab', 'abc'],
    });

    testBuildResolver('ab match ab,a*', {
      roleIds: ['a*', 'ab', 'abc'],
      scope: 'assume:ab',
      expected: ['a*', 'ab'],
      maxSets: 6,
    });

    testBuildResolver('a*b* matches a*b, a*bc', {
      roleIds: ['a', 'a*b', 'a*bc', 'ab', 'abc', 'b*', 'c*', 'ab*'],
      scope: 'assume:a*b*',
      expected: ['a*b', 'a*bc'],
    });

    testBuildResolver('a*b matches a*, a*b', {
      roleIds: ['a*', 'a*b', 'a*bc', 'ab', 'abc', 'b*', 'c*', 'ab*'],
      scope: 'assume:a*b',
      expected: ['a*b', 'a*'],
    });

    testBuildResolver('a*b* matches a*b, a*bc', {
      roleIds: ['a*', 'a*b', 'a*bc', 'ab', 'abc', 'b*', 'c*', 'ab*'],
      scope: 'assume:a*b*',
      expected: ['a*b', 'a*bc', 'a*'],
    });

    testBuildResolver('try with 50', {
      roleIds: _.range(50).map(i => 't-' + i),
      scope: 'assume:t-1',
      expected: ['t-1'],
    });

    testBuildResolver('try with 500', {
      roleIds: _.range(500).map(i => 't-' + i),
      scope: 'assume:t-12*',
      expected: _.range(10).map(i => 't-12' + i).concat('t-12'),
      skipShuffle: true,
      time: true,
    });

    testBuildResolver('try with 5000', {
      roleIds: _.range(5000).map(i => 't-' + i),
      scope: 'assume:t-122*',
      expected: _.range(10).map(i => 't-122' + i).concat('t-122'),
      skipShuffle: true,
      time: true,
    });

    testBuildResolver('try with 5000 - exact match', {
      roleIds: _.range(5000).map(i => 't-' + i),
      scope: 'assume:t-1234',
      expected: ['t-1234'],
      skipShuffle: true,
      time: true,
    });

    // Test cases for grantsRole
    [
      {
        // cases with *
        scope:    '*',
        role:     '*',
        result:   true,
      }, {
        scope:    '*',
        role:     'client-id:queue',
        result:   true,
      }, {
        scope:    '*',
        role:     'task-run-id:*',
        result:   true,
      }, {
        // cases with as*
        scope:    'as*',
        role:     '*',
        result:   true,
      }, {
        scope:    'as*',
        role:     'client-id:queue',
        result:   true,
      }, {
        scope:    'as*',
        role:     'task-run-id:*',
        result:   true,
      }, {
        scope:    'queue:*',
        role:     'task-run-id:*',
        result:   false,
      }, {
        // cases with assume:*
        scope:    'assume:*',
        role:     'client-id:queue',
        result:   true,
      }, {
        scope:    'assume:*',
        role:     'task-run-id:*',
        result:   true,
      }, {
        scope:    'assume:*',
        role:     '*',
        result:   true,
      }, {
        // cases with assume:<prefix>*
        scope:    'assume:thing-id:*',
        role:     'thing-id:queue',
        result:   true,
      }, {
        scope:    'assume:task-run-id:*',
        role:     'task-run-id:*',
        result:   true,
      }, {
        scope:    'assume:task-run-id:*',
        role:     '*',
        result:   true,
      }, {
        scope:    'assume:task-run-id:*',
        role:     'task-run-*',
        result:   true,
      }, {
        scope:    'assume:task-run-id:*',
        role:     'client-id:queue',
        result:   false,
      }, {
        scope:    'assume:task-run-id:*',
        role:     'client-id:*',
        result:   false,
      }, {
        // cases with assume:roleId
        scope:    'assume:thing-id:queue',
        role:     'thing-id:queue',
        result:   true,
      }, {
        scope:    'assume:task-run-id:12345',
        role:     'task-run-id:72345',
        result:   false,
      }, {
        scope:    'assume:task-run-id:12345',
        role:     'task-run-id:*',
        result:   true,
      }, {
        scope:    'assume:task-run-id:12345',
        role:     '*',
        result:   true,
      }, {
        scope:    'assume:task-run-id:12345',
        role:     'task-run-*',
        result:   true,
      }, {
        scope:    'assume:task-run-id:12345',
        role:     'client-id:*',
        result:   false,
      }, {
        scope:    'assume:a',
        role:     'a*',
        result:   true,
      }, {
        scope:    'assume:a*',
        role:     'a*',
        result:   true,
      }, {
        scope:    'assume:a*',
        role:     'a',
        result:   true,
      }, {
        scope:    'assume:ab*',
        role:     'ac*',
        result:   false,
      },
    ].forEach(({scope, role, result}) => {
      testBuildResolver(`grantsRole(${scope}, ${role}) === ${result}`, {
        roleIds: [role],
        scope,
        expected: result ? [role] : [],
        maxSets: 5,
      });
    });
  });

  suite('fixed-point computation', function() {
    let testFixedPointComputation = (title, {roles, scope, expected}) => {
      test(title, () => {
        let resolver = dfa.computeFixedPoint(roles);

        let results = resolver(scope);
        if (_.xor(results, expected).length !== 0) {
          console.log('expected:');
          console.log(expected);
          console.log('got:');
          console.log(results);
          assert(false, 'Expected different result!');
        }
      });
    };

    testFixedPointComputation('* get all', {
      roles: [
        {
          roleId: 'client-id:root',
          scopes: ['*'],
        },
      ],
      scope: '*',
      expected: ['*'],
    });

    testFixedPointComputation('thing-id:* get all things', {
      roles: [
        {
          roleId: 'thing-id:star',
          scopes: ['*'],
        },
      ],
      scope: 'assume:thing-id:*',
      expected: ['*'],
    });

    testFixedPointComputation('star-scope-role get all', {
      roles: [
        {
          roleId: 'star-scope-role',
          scopes: ['*'],
        },
      ],
      scope: 'assume:star-scope-role',
      expected: ['*'],
    });

    testFixedPointComputation('test with stupid', {
      roles: [
        {
          roleId: 'thing-id:big-test',
          scopes: ['assume:test-role-0'],
        }, {
          roleId: 'test-role-10',
          scopes: ['special-scope'],
        }, {
          roleId: 'test-role-0',
          scopes: ['assume:test-role-2'],
        }, {
          roleId: 'test-role-2',
          scopes: ['assume:test-role-10'],
        },
      ],
      scope: 'assume:thing-id:big-test',
      expected: [
        'special-scope',
        'assume:test-role-0',
        'assume:test-role-2',
        'assume:test-role-10',
      ],
    });

    const N = 500;
    testFixedPointComputation('test with N = ' + N, {
      roles: [
        {
          roleId: 'thing-id:c',
          scopes: ['assume:tr-0'],
        }, {
          roleId: 'tr-' + N,
          scopes: ['special-scope'],
        },
      ].concat(_.range(N).map(i => {
        return {
          roleId: 'tr-' + i,
          scopes: ['assume:tr-' + (i + 1)],
        };
      })),
      scope: 'assume:thing-id:c',
      expected: [
        'special-scope',
      ].concat(_.range(N + 1).map(i => 'assume:tr-' + i)),
    });

    const M = 5;  // depth
    const K = 500; // multiplier
    testFixedPointComputation('test with depth = ' + M + ' x ' + K, {
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
        [{
          roleId: 'thing-id:c',
          scopes: ['assume:k-2-0'],
        }],
      ]),
      scope: 'assume:thing-id:c',
      expected: [
        'special-scope',
      ].concat(_.range(M + 1).map(i => 'assume:k-2-' + i)),
    });

    _.range(100).forEach(i => {
      const M = _.random(3, 7);
      const K = _.random(7, 100);
      let name = 'test with depth = ' + M + ' x ' + K + ' (iteration: ' + i + ')';
      testFixedPointComputation(name, {
        roles: _.shuffle(_.flatten([
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
          [{
            roleId: 'thing-id:c',
            scopes: ['assume:k-2-0'],
          }],
        ])),
        scope: 'assume:thing-id:c',
        expected: _.shuffle([
          'special-scope',
        ].concat(_.range(M + 1).map(i => 'assume:k-2-' + i))),
      });
    });
  });

  suite('performance', function() {
    const makeResolver = roles => {
      const res = dfa.computeFixedPoint(roles);
      return scopes => {
        scopes.sort(dfa.scopeCompare);
        return _.reduce(scopes.map(res), (a, b) => dfa.mergeScopeSets(a, b), scopes);
      };
    };

    const shouldMeasure = process.env.MEASURE_PERFORMANCE;
    const measureN = 50;
    const measureSkip = 5; // initial runs to skip (allows JIT warmup)
    const timings = [];

    const testResolver = (title, {roles, scopes, expected}) => {
      test(title, function() {
        let timing, time;
        if (shouldMeasure) {
          // this could take a while..
          this.slow(3600000);
          this.timeout(0);

          timing = {title};
          timings.push(timing);
          time = (step, fn) => {
            let result;
            timing[step] = [];
            for (let i = 0; i < measureN; i++) {
              const start = process.hrtime();
              result = fn();
              const took = process.hrtime(start);
              timing[step].push(took[0] * 1000000000 + took[1]);
            }
            timing[step].splice(0, measureSkip);
            let mean = _.reduce(timing[step], (a, b) => a + b) / timing[step].length;
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

        let resolver = time('setup', () => makeResolver(roles));
        let result = time('execute', () => resolver(scopes));
        if (expected) {
          expected.sort(dfa.scopeCompare);
          assert.deepEqual(expected, resolver(scopes));
        }
      });
    };

    suiteTeardown(function() {
      if (!shouldMeasure) {
        return;
      }

      fs.writeFileSync('timings.json', JSON.stringify(timings, null, 2));
      console.log('timings written to timings.json');
    });

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
        if (h != H) {
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
    //   `curl https://auth.taskcluster.net/v1/roles`
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
  	]);

  	testRealRoles(['assume:repo:github.com/*']);
  	testRealRoles(['assume:worker-type:*']);
  	testRealRoles(['assume:mozilla-user:*']);
  	testRealRoles(['assume:mozilla-group:team_taskcluster']);
  	testRealRoles(['assume:moz-tree:level:3']);
  });
});
