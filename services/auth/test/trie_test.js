suite('trie', () => {
  let {generateTrie, executeTrie} = require('../src/trie');
  let {mergeScopeSets, scopeCompare} = require('taskcluster-lib-scopes');
  let assert = require('assert');
  let _ = require('lodash');
  let fs = require('fs');
  let debug = require('debug')('trie_test');

  suite('generateTrie', function() {
    let testTrie = (rules, expected) => {
      let got = generateTrie(rules);
      assert.deepEqual(expected, got);
    };

    test('for a single, one-character, non-star rule', function() {
      testTrie([
        {pattern: 'a', scopes: ['def']},
      ], {
        a: {
          end: {
            scopes: ['def'],
          },
          '*': {
            end: {
              scopes: ['def'],
            },
          },
        },
        '*': {
          end: {
            scopes: ['def'],
          },
        },
      });
    });

    test('for a single, one-character, star rule', function() {
      testTrie([
        {pattern: '*', scopes: ['def']},
      ], {
        scopes: ['def'],
      });
    });

    test('for a rule with a nonterminal star', function() {
      testTrie([
        {pattern: '*x', scopes: ['def']},
      ], {
        '*': {
          end: {
            scopes: ['def'],
          },
          '*': {
            end: {
              scopes: ['def'],
            },
          },
          x: {
            end: {
              scopes: ['def'],
            },
            '*': {
              end: {
                scopes: ['def'],
              },
            },
          },
        },
      });
    });

    test('for a single, longer non-star rule', function() {
      testTrie([
        {pattern: 'abc', scopes: ['def']},
      ], {
        a: {
          b: {
            c: {
              end: {
                scopes: ['def'],
              },
              '*': {
                end: {
                  scopes: ['def'],
                },
              },
            },
            '*': {
              end: {
                scopes: ['def'],
              },
            },
          },
          '*': {
            end: {
              scopes: ['def'],
            },
          },
        },
        '*': {
          end: {
            scopes: ['def'],
          },
        },
      });
    });

    test('for a single, longer star rule', function() {
      testTrie([
        {pattern: 'ab*', scopes: ['def']},
      ], {
        a: {
          b: {
            scopes: ['def'],
          },
          '*': {
            end: {
              scopes: ['def'],
            },
          },
        },
        '*': {
          end: {
            scopes: ['def'],
          },
        },
      });
    });

    test('for several overlapping rules', function() {
      testTrie([
        {pattern: 'ab', scopes: ['A']},
        {pattern: 'ab*', scopes: ['B']},
        {pattern: 'abc', scopes: ['C']},
      ], {
        a: {
          b: {
            scopes: ['B'],
            c: {
              '*': {
                end: {
                  scopes: ['C'],
                },
              },
              end: {
                scopes: ['C'],
              },
            },
            '*': {
              end: {
                scopes: ['A', 'C'],
              },
            },
            end: {
              scopes: ['A'],
            },
          },
          '*': {
            end: {
              scopes: ['A', 'B', 'C'],
            },
          },
        },
        '*': {
          end: {
            scopes: ['A', 'B', 'C'],
          },
        },
      });
    });

    test('scopesets are normalized', function() {
      testTrie([
        {pattern: 'ab', scopes: ['ABC', 'B*']},
        {pattern: 'ac', scopes: ['A*', 'BAR']},
      ], {
        a: {
          '*': {
            end: {
              scopes: ['A*', 'B*'],
            },
          },
          b: {
            '*': {
              end: {
                scopes: ['ABC', 'B*'],
              },
            },
            end: {
              scopes: ['ABC', 'B*'],
            },
          },
          c: {
            '*': {
              end: {
                scopes: ['A*', 'BAR'],
              },
            },
            end: {
              scopes: ['A*', 'BAR'],
            },
          },
        },
        '*': {
          end: {
            scopes: ['A*', 'B*'],
          },
        },
      });
    });
  });

  suite('generateTrie + executeTrie', function() {
    let testTrie = (title, rules, expected) => {
      let d = generateTrie(rules);
      suite(title, function() {
        suiteSetup(function() {
          rules.forEach(r => debug(`rule: ${JSON.stringify(r.pattern)} -> ${JSON.stringify(r.scopes)}`));
        });
        expected.forEach(({input, expected}) => {
          test(`input=${JSON.stringify(input)}`, function() {
            debug(`input: ${JSON.stringify(input)}`);
            const result = {};
            executeTrie(d, input, (scopes, offset) => {
              result[offset] = scopes;
            });
            for (let i = 0; i < input.length + 1; i++) {
              const inp = input + '$';
              debug(`${inp.slice(0, i)}|${inp.slice(i)} -> ${JSON.stringify(result[i])}`);
            }
            assert.deepEqual(result, expected, `for input ${JSON.stringify(input)}`);
          });
        });
      });
    };

    testTrie('for a simple star rule', [
      {pattern: 'ab*', scopes: ['d<..>f']},
    ], [
      {input: '', expected: {}},
      {input: '*', expected: {2: ['d<..>f']}},
      {input: 'a', expected: {}},
      {input: 'a*', expected:  {3: ['d<..>f']}},
      {input: 'ab', expected: {2: ['d<..>f']}},
      {input: 'ab*', expected: {2: ['d<..>f']}},
      {input: 'abc', expected: {2: ['d<..>f']}},
      {input: 'abc*', expected: {2: ['d<..>f']}},
    ]);

    testTrie('for a simple non-star rule', [
      {pattern: 'xy', scopes: ['pq']},
    ], [
      {input: '', expected: {}},
      {input: '*', expected: {2: ['pq']}},
      {input: 'x', expected: {}},
      {input: 'x*', expected: {3: ['pq']}},
      {input: 'xy', expected: {3: ['pq']}},
      {input: 'xy*', expected: {4: ['pq']}},
      {input: 'xyc', expected: {}},
      {input: 'xyc*', expected: {}},
    ]);

    testTrie('nonterminal star in role', [
      {pattern: 'a*c', scopes: ['x']},
    ], [
      {input: '', expected: {}},
      {input: '*', expected: {2: ['x']}},
      {input: 'a', expected: {}},
      {input: 'a*', expected: {3: ['x']}},
      {input: 'ab', expected: {}},
      {input: 'a**', expected: {4: ['x']}},
      {input: 'abc', expected: {}},
      {input: 'a*c', expected: {4: ['x']}},
      {input: 'a*c*', expected: {5: ['x']}},
    ]);

    testTrie('nonterminal star in scope', [
      {pattern: 'abc', scopes: ['x']},
    ], [
      {input: '*bc', expected: {}},
      {input: 'a*c', expected: {}},
    ]);

    testTrie('for several overlapping rules', [
      {pattern: 'ab', scopes: ['A']},
      {pattern: 'ab*', scopes: ['B']},
      {pattern: 'abc', scopes: ['C']},
    ], [
      {input: '', expected: {}},
      {input: 'a', expected: {}},
      {input: 'a*', expected: {3: ['A', 'B', 'C']}},
      {input: 'ab', expected: {2: ['B'], 3: ['A']}},
      {input: 'ab*', expected: {2: ['B'], 4: ['A', 'C']}},
      {input: 'abx', expected: {2: ['B']}},
      {input: 'abc', expected: {2: ['B'], 4: ['C']}},
      {input: 'abcx', expected: {2: ['B']}},
    ]);
  });
});
