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
            let got = executeTrie(d, input);
            // trim trailing 'undefineds' since they're the default anyway, and
            // we don't care if executeTrie "gives up" early
            while (got.length && !got[got.length - 1]) {
              got.pop();
            }
            got.forEach((scopes, k) => {
              let inp = input + '$';
              debug(`${inp.slice(0, k)}|${inp.slice(k)} -> ${JSON.stringify(scopes)}`);
            });
            assert.deepEqual(got, expected, `for input ${JSON.stringify(input)}`);
          });
        });
      });
    };

    testTrie('for a simple star rule', [
      {pattern: 'ab*', scopes: ['d<..>f']},
    ], [
      {input: '', expected: []},
      {input: '*', expected: [undefined, undefined, ['d<..>f']]},
      {input: 'a', expected: []},
      {input: 'a*', expected: [undefined, undefined, undefined, ['d<..>f']]},
      {input: 'ab', expected: [undefined, undefined, ['d<..>f']]},
      {input: 'ab*', expected: [undefined, undefined, ['d<..>f']]},
      {input: 'abc', expected: [undefined, undefined, ['d<..>f']]},
      {input: 'abc*', expected: [undefined, undefined, ['d<..>f']]},
    ]);

    testTrie('for a simple non-star rule', [
      {pattern: 'xy', scopes: ['pq']},
    ], [
      {input: '', expected: []},
      {input: '*', expected: [undefined, undefined, ['pq']]},
      {input: 'x', expected: []},
      {input: 'x*', expected: [undefined, undefined, undefined, ['pq']]},
      {input: 'xy', expected: [undefined, undefined, undefined, ['pq']]},
      {input: 'xy*', expected: [undefined, undefined, undefined, undefined, ['pq']]},
      {input: 'xyc', expected: []},
      {input: 'xyc*', expected: []},
    ]);

    testTrie('nonterminal star in role', [
      {pattern: 'a*c', scopes: ['x']},
    ], [
      {input: '', expected: []},
      {input: '*', expected: [undefined, undefined, ['x']]},
      {input: 'a', expected: []},
      {input: 'a*', expected: [undefined, undefined, undefined, ['x']]},
      {input: 'ab', expected: []},
      {input: 'a**', expected: [undefined, undefined, undefined, undefined, ['x']]},
      {input: 'abc', expected: []},
      {input: 'a*c', expected: [undefined, undefined, undefined, undefined, ['x']]},
      {input: 'a*c*', expected: [undefined, undefined, undefined, undefined, undefined, ['x']]},
    ]);

    testTrie('nonterminal star in scope', [
      {pattern: 'abc', scopes: ['x']},
    ], [
      {input: '*bc', expected: []},
      {input: 'a*c', expected: []},
    ]);

    testTrie('for several overlapping rules', [
      {pattern: 'ab', scopes: ['A']},
      {pattern: 'ab*', scopes: ['B']},
      {pattern: 'abc', scopes: ['C']},
    ], [
      {input: '', expected: []},
      {input: 'a', expected: []},
      {input: 'a*', expected: [undefined, undefined, undefined, ['A', 'B', 'C']]},
      {input: 'ab', expected: [undefined, undefined, ['B'], ['A']]},
      {input: 'ab*', expected: [undefined, undefined, ['B'], undefined, ['A', 'C']]},
      {input: 'abx', expected: [undefined, undefined, ['B']]},
      {input: 'abc', expected: [undefined, undefined, ['B'], undefined, ['C']]},
      {input: 'abcx', expected: [undefined, undefined, ['B']]},
    ]);
  });
});
