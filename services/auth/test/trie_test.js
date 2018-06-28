suite('trie', () => {
  const assume = require('assume');
  const _ = require('lodash');
  const debug = require('debug')('test:trie');
  //const {patternMatch} = require('taskcluster-lib-scopes');
  const ScopeSetBuilder = require('../src/scopesetbuilder');
  const trie = require('../src/trie');
  const trietestcases = require('./trietestcases');

  /**
   * Return scope without kleene '*' at the end if scope ends with kleene, otherwise
   * this just returns the scope given. Notice, this doesn't recursively strip '*'
   */
  const withoutKleene = (scope) => scope.endsWith('*') ? scope.slice(0, -1) : scope;

  const patternMatch = (pattern, scope) => {
    if (scope === pattern) {
      return true;
    }
    if (pattern.endsWith('*')) {
      return withoutKleene(scope).startsWith(pattern.slice(0, -1));
    }
    return false;
  };

  suite('dependencyOrdering', () => {
    [
      [
        {pattern: 'a', scopes: ['b']},
      ], [
        {pattern: 'a*', scopes: ['b']},
      ], [
        {pattern: 'a', scopes: ['b']},
        {pattern: 'c', scopes: ['d']},
      ], [
        {pattern: 'a*', scopes: ['b*']},
        {pattern: 'c*', scopes: ['d*']},
      ], [
        {pattern: 'a*', scopes: ['b<..>z']},
        {pattern: 'c*', scopes: ['d<..>']},
      ],
    ].forEach((rules, index) => test(`independent rules (${index+1})`, () => {
      _.range(50).forEach(() => { // run 50 times with different shuffling
        const ordering = trie.dependencyOrdering(_.shuffle(rules));
        assume(ordering).has.length(rules.length);
        for (const {pattern} of rules) {
          assume(ordering.map(r => r.pattern)).contains(pattern);
        }
      });
    }));

    [ // rules must be strictly dependent and ordered by dependency
      [
        {pattern: 'c',    scopes: ['nothing']},
        {pattern: 'b',    scopes: ['c']},
        {pattern: 'a',    scopes: ['b']},
      ], [
        {pattern: 'c',    scopes: ['nothing']},
        {pattern: 'b',    scopes: ['c']},
        {pattern: 'a',    scopes: ['b']},
      ], [
        {pattern: 'ccc',  scopes: ['nothing']},
        {pattern: 'b',    scopes: ['c*']},
        {pattern: 'a',    scopes: ['b']},
      ], [
        {pattern: 'c*',   scopes: ['nothing']},
        {pattern: 'b',    scopes: ['cb']},
        {pattern: 'a',    scopes: ['b']},
      ], [
        {pattern: 'c*',   scopes: ['nothing']},
        {pattern: 'bbb',  scopes: ['cb']},
        {pattern: 'a*',   scopes: ['b<..>']},
      ], [
        {pattern: 'c*',   scopes: ['nothing']},
        {pattern: 'bbb',  scopes: ['cb']},
        {pattern: 'a*',   scopes: ['b<..>c']},
      ], [
        {pattern: 'ettt', scopes: ['nothing']},
        {pattern: 'd*',   scopes: ['e<..>z']},
        {pattern: 'c*',   scopes: ['dd<..>']},
        {pattern: 'bbb',  scopes: ['cb']},
        {pattern: 'a*',   scopes: ['b<..>c']},
      ],
    ].forEach((rules, index) => test(`acyclic rules (${index+1})`, () => {
      _.range(50).forEach(() => { // run 50 times with different shuffling
        const ordering = trie.dependencyOrdering(_.shuffle(rules));
        assume(ordering.map(r => r.pattern)).eql(rules.map(r => r.pattern));
      });
    }));

    [
      [
        {pattern: 'a', scopes: ['a']},
      ], [
        {pattern: 'ab', scopes: ['a*']},
      ], [
        {pattern: 'a*', scopes: ['ab']},
      ], [
        {pattern: 'c', scopes: ['a']},
        {pattern: 'b', scopes: ['c']},
        {pattern: 'a', scopes: ['b']},
      ], [
        {pattern: 'c', scopes: ['a*']},
        {pattern: 'b', scopes: ['c']},
        {pattern: 'aa', scopes: ['b']},
      ], [
        {pattern: 'c', scopes: ['aa']},
        {pattern: 'b', scopes: ['c']},
        {pattern: 'a*', scopes: ['b']},
      ], [
        {pattern: 'c', scopes: ['aa']},
        {pattern: 'b', scopes: ['c']},
        {pattern: 'a*', scopes: ['b<..>']},
      ], [
        {pattern: 'c', scopes: ['aa']},
        {pattern: 'b', scopes: ['c']},
        {pattern: 'a*', scopes: ['b<..>c']},
      ], [
        // one could argue we should allow cycles like this, because it's just
        // repeated rule application, but as far as I can see this can be used
        // create degenerate patterns that explode the size of the trie.
        // (and I don't think we need this much power)
        {pattern: 'ettt', scopes: ['aaa']},
        {pattern: 'd*',   scopes: ['e<..>z']},
        {pattern: 'c*',   scopes: ['dd<..>']},
        {pattern: 'bbb',  scopes: ['cb']},
        {pattern: 'a*',   scopes: ['b<..>c']},
      ],
    ].forEach((rules, index) => test(`cyclic rules (${index+1})`, () => {
      assume(() => {
        trie.dependencyOrdering(rules);
      }).throws('cycle');
    }));

    [
      [
        {pattern: 'a*', scopes: ['b<..>c<..>']},
      ], [
        {pattern: 'a*', scopes: ['b<..>c<..>d']},
      ], [
        {pattern: 'a*', scopes: ['b<..>c<..>d<..>']},
      ], [
        {pattern: 'a*', scopes: ['b*<..>']},
      ], [
        {pattern: 'a*', scopes: ['bc*<..>']},
      ],
    ].forEach((rules, index) => test(`illegal scopes (${index+1})`, () => {
      assume(() => {
        trie.dependencyOrdering(rules);
      }).throws('scope', 'expected illegal scope');
    }));
  });

  /**
   * Map characters in a test-case to something else
   *
   * Apply mapChar to all characters in the test-case, so long as these are not
   * kleene '*' or parameter '<..>'. Star '*' and '<..>' in context where they
   * are not kleene and parameter will be passed through mapChar(character).
   *
   * This aims to facilitating explosion of test cases by expanding single
   * characters to one or more characters, hence, allowing slices that would
   * otherwise not have been possible.
   */
  const caseMapper = (titleSuffix, mapChar) => ({title, rules, hasIndirctResults, results}) => {
    // Helper method to map a pattern
    const mapP = (p) => p.split('').map(mapChar).join('');
    // Helper method to apply mapP while respecting kleene
    const mapPWithKleene = (p) => p.endsWith('*')
      ? mapP(p.slice(0, -1)) + '*'
      : mapP(p);

      //console.log(JSON.stringify(rules, null, 2));
    // map rules, notice that we have to handle the space case where <..> is
    // interpreted as a parameter, otherwise we just pass through mapPWithKleene
    rules = rules.map(({pattern, scopes}) => {
      if (!pattern.endsWith('*')) {
        scopes = scopes.map(mapPWithKleene);
      } else {
        scopes = [
          ...scopes
            .filter(s => !s.includes('<..>'))
            .map(mapPWithKleene),
          ...scopes
            .filter(s => s.includes('<..>'))
            .map(s => s.split('<..>'))
            .map(([A, B]) => `${mapP(A)}<..>${mapPWithKleene(B)}`),
        ];
      }
      return {pattern: mapPWithKleene(pattern), scopes};
    });

    // For results, we just map through mapPWithKleene
    results = Object.assign({}, ...Object.entries(results).map(([input, scopes]) => ({
      [mapPWithKleene(input)]: scopes.map(mapPWithKleene),
    })));
    //console.log(JSON.stringify(rules, null, 2));

    return {title: `${title} (${titleSuffix})`, rules, hasIndirctResults, results};
  };

  /**
   * Simple implementation of the semantics that is expected to be correct
   *
   * This is intended to be used for automatically generating further test
   * cases and, hence, fuzzing the trie building process and execution of trie.
   */
  const evalRulesRecursively = (rules, input) => {
    const queue = [input];
    let result = [];
    while (queue.length > 0) {
      const input = queue.pop();
      for (const {pattern, scopes} of rules) {
        if (!patternMatch(pattern, input) && !patternMatch(input, pattern)) {
          continue;
        }
        let newScopes = scopes;
        if (pattern.endsWith('*')) {
          const remaining = patternMatch(pattern, input) ? input.slice(pattern.length - 1) : '*';
          if (input.endsWith('*')) {
            newScopes = scopes.map(s => s.replace(/\<\.\.\>.*$/, remaining));
          } else {
            newScopes = scopes.map(s => s.replace('<..>', remaining));
          }
        }
        queue.push(...newScopes.filter(scope => !result.some(s => patternMatch(s, scope))));
        result = ScopeSetBuilder.normalizeScopeSet([...result, ...newScopes]);
      }
    }
    return result;
  };

  /** generate all sets of two different elements from the set */
  const allSetsOfTwo = (set) => {
    const result = [];
    for (let i = 0; i < set.length; i++) {
      for (let j = i+1; j < set.length; j++) {
        result.push([set[i], set[j]]);
      }
    }
    return result;
  };

  /** Given two test cases A and B merge them to create two new test cases */
  const mergeTestCases = ([A, B]) => {
    // Merges rules from both test cases, if a pattern exists in both we merge
    // the list of scopes granted.
    let rules = _.cloneDeep(A.rules); // clone to avoid modifying orignal
    for (const {pattern, scopes} of B.rules) {
      const i = rules.findIndex(r => r.pattern === pattern);
      if (i !== -1) {
        rules[i].scopes.push(...scopes);
      } else {
        rules.push({pattern, scopes: [...scopes]});
      }
    }

    // check if merging rules from A and B creates a dependency cycle
    // if so remove an offending rule until there is no more cycles.
    while (true) {
      try {
        trie.dependencyOrdering(rules);
      } catch (err) {
        if (err.code === 'DependencyCycleError') {
          // Remove first rule that gave rise to a cycle, we could do something
          // smarter, but this is an effective way to remove cycles.
          rules = rules.filter(r => r.pattern !== err.cycle[0]);
          continue;
        }
        throw err;
      }
      break;
    }

    // Take input examples from both and derive new results using
    // evalRulesRecursively
    const results = Object.assign({}, ..._.uniq([
      ...Object.keys(A.results),
      ...Object.keys(B.results),
    ]).map(input => ({[input]: evalRulesRecursively(rules, input)})));

    return {
      title: `${A.title} X ${B.title}`,
      hasIndirctResults: true, // we have to assume this could be the case
      rules,
      results,
    };
  };

  const testCases = [
    // All test cases as is
    ...trietestcases,
    // All test cases with characters mapped to [<hex>] excluding '*'
    ...trietestcases.map(caseMapper('[XX]+*', c => c === '*' ? '*' :
      `[${c.codePointAt(0).toString(16).padStart(2, '0')}]`,
    )),
    // All test cases with characters mapped to [<hex>] including '*'
    ...trietestcases.map(caseMapper('[XX]', c =>
      `[${c.codePointAt(0).toString(16).padStart(2, '0')}]`,
    )),
    // All test cases with characters mapped to *<hex>*! excluding '*' (injecting more stars)
    ...trietestcases.map(caseMapper('*XX*!', c => c === '*' ? '*' :
      `*${c.codePointAt(0).toString(16).padStart(2, '0')}*!`,
    )),
    ...allSetsOfTwo(trietestcases).map(mergeTestCases),
  ];

  /** Function for building a trie that only supports direct matches */
  const buildDirectMatchOnlyTrie = (rules) => {
    const Node = trie._Node;
    const t = new Node();
    for (const {pattern, matched, paramed} of trie.dependencyOrdering(rules)) {
      if (pattern.endsWith('*')) {
        t.merge(pattern.slice(0, -1), new Node([], matched, paramed));
      } else {
        t.merge(pattern, new Node(matched));
      }
    }
    return t;
  };

  suite('evalRulesRecursively (test the test cases)', () => {
    for (const {title, rules, results} of testCases) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          assume(evalRulesRecursively(rules, input)).eql(ScopeSetBuilder.normalizeScopeSet(scopes));
        }
      });
    }
  });

  suite('execute (direct only)', () => {
    for (const {title, rules, results} of testCases.filter(c => !c.hasIndirctResults)) {
      test(title, () => {
        const t = buildDirectMatchOnlyTrie(rules);
        for (const [input, scopes] of Object.entries(results)) {
          assume(trie.execute(t, input).scopes()).eql(ScopeSetBuilder.normalizeScopeSet(scopes));
        }
      });
    }
  });

  /** Get all pairs [prefix, suffix] such that prefix + suffix = input */
  const allSplits = (input) => _.range(input.length+1).map(i => [input.slice(0, i), input.slice(i)]);

  /** Get all pairs [prefix, suffix] such that prefix + suffix = input and works in withPrefix */
  const allPrefixSplits = (input) => allSplits(input).filter(([prefix, remaining]) =>
    // prefixes ending with kleene won't work in withPrefix, this is documented
    // Nor is it desired if we parse 'prefix<..>suffix', then '*' cannot
    // be interpreted as kleene in the prefix. If suffix is '', then
    // prefix is not allowed to end with '*' because it would ambiguous.
    // This is also forbidden in transformRules(). Hence, we filter out such splits
    !prefix.endsWith('*') || remaining !== '',
  );

  /** Get all pairs [prefix, suffix] such that prefix + suffix = input and works in withSuffix */
  const allSuffixSplits = (input) => allSplits(input).filter(([remaining, suffix]) =>
    // if the remaining input ends with '*' this will be interpreted as
    // kleene, which is different from the original input. Hence, we
    // we get the result from '<remaining>*' and not the result from
    // '<remaining>*<suffix>', thus, we must skip this test case.
    // This behavior is both desired and documented in withSuffix()
    !remaining.endsWith('*') || suffix === '',
  );

  suite('withPrefix (direct only) for all splits', () => {
    for (const {title, rules, results} of testCases.filter(c => !c.hasIndirctResults)) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [prefix, remaining] of allPrefixSplits(input)) {
            const t = trie.withPrefix(buildDirectMatchOnlyTrie(rules), prefix);
            assume(trie.execute(t, remaining).scopes()).eql(
              ScopeSetBuilder.normalizeScopeSet(scopes),
              `failed withPrefix on split "${prefix}|${remaining}"`,
            );
          }
        }
      });
    }
  });

  suite('withSuffix (direct only) for all splits', () => {
    for (const {title, rules, results} of testCases.filter(c => !c.hasIndirctResults)) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [remaining, suffix] of allSuffixSplits(input)) {
            const t = trie.withSuffix(buildDirectMatchOnlyTrie(rules), suffix);
            assume(trie.execute(t, remaining).scopes()).eql(
              ScopeSetBuilder.normalizeScopeSet(scopes),
              `failed withSuffix on split "${remaining}|${suffix}"`,
            );
          }
        }
      });
    }
  });

  suite('withSuffix + withPrefix (direct only) for all splits', () => {
    for (const {title, rules, results} of testCases.filter(c => !c.hasIndirctResults)) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [prefix, remaining] of allPrefixSplits(input)) {
            for (const [param, suffix] of allSuffixSplits(remaining)) {
              const t = trie.withPrefix(trie.withSuffix(buildDirectMatchOnlyTrie(rules), suffix), prefix);
              assume(trie.execute(t, param).scopes()).eql(
                ScopeSetBuilder.normalizeScopeSet(scopes),
                `failed withPrefix + withSuffix on split "${prefix}|${param}|${suffix}"`
              );
            }
          }
        }
      });
    }
  });

  suite('withPrefix + withSuffix (direct only) for all splits', () => {
    for (const {title, rules, results} of testCases.filter(c => !c.hasIndirctResults)) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [prefix, remaining] of allPrefixSplits(input)) {
            for (const [param, suffix] of allSuffixSplits(remaining)) {
              const t = trie.withSuffix(trie.withPrefix(buildDirectMatchOnlyTrie(rules), prefix), suffix);
              assume(trie.execute(t, param).scopes()).eql(
                ScopeSetBuilder.normalizeScopeSet(scopes),
                `failed withSuffix + withPrefix on split "${prefix}|${param}|${suffix}"`
              );
            }
          }
        }
      });
    }
  });

  suite('build + execute', () => {
    for (const {title, rules, results} of testCases) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          const t = trie.build(rules);
          assume(trie.execute(t, input).scopes()).eql(ScopeSetBuilder.normalizeScopeSet(scopes));
        }
      });
    }
  });

  suite('build + withPrefix', () => {
    for (const {title, rules, results} of testCases) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [prefix, remaining] of allPrefixSplits(input)) {
            const t = trie.withPrefix(trie.build(rules), prefix);
            assume(trie.execute(t, remaining).scopes()).eql(
              ScopeSetBuilder.normalizeScopeSet(scopes),
              `failed withPrefix on split "${prefix}|${remaining}"`,
            );
          }
        }
      });
    }
  });

  suite('build + withSuffix', () => {
    for (const {title, rules, results} of testCases) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [remaining, suffix] of allSuffixSplits(input)) {
            const t = trie.withSuffix(trie.build(rules), suffix);
            assume(trie.execute(t, remaining).scopes()).eql(
              ScopeSetBuilder.normalizeScopeSet(scopes),
              `failed withSuffix on split "${remaining}|${suffix}"`,
            );
          }
        }
      });
    }
  });

  suite('build + withSuffix + withPrefix', () => {
    for (const {title, rules, results} of testCases) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [prefix, remaining] of allPrefixSplits(input)) {
            for (const [param, suffix] of allSuffixSplits(remaining)) {
              const t = trie.withPrefix(trie.withSuffix(trie.build(rules), suffix), prefix);
              assume(trie.execute(t, param).scopes()).eql(
                ScopeSetBuilder.normalizeScopeSet(scopes),
                `failed withPrefix + withSuffix on split "${prefix}|${param}|${suffix}"`
              );
            }
          }
        }
      });
    }
  });

  suite('build + withPrefix + withSuffix', () => {
    for (const {title, rules, results} of testCases) {
      test(title, () => {
        for (const [input, scopes] of Object.entries(results)) {
          for (const [prefix, remaining] of allPrefixSplits(input)) {
            for (const [param, suffix] of allSuffixSplits(remaining)) {
              const t = trie.withSuffix(trie.withPrefix(trie.build(rules), prefix), suffix);
              assume(trie.execute(t, param).scopes()).eql(
                ScopeSetBuilder.normalizeScopeSet(scopes),
                `failed withSuffix + withPrefix on split "${prefix}|${param}|${suffix}"`
              );
            }
          }
        }
      });
    }
  });

  /** Walk all paths in a trie, calling visit(path, node) for all nodes in the trie */
  const walk = (trie, visit = (path, node) => {}, prefix = '') => {
    visit(prefix, trie);
    for (const [character, child] of trie.children) {
      walk(child, visit, prefix + character);
    }
  };

  /** Create all pairs consistent of two entries from elements */
  const allPairs = (elements) => _.flatten(elements.map(a => elements.map(b => [a, b])));

  suite('build + execute (for all walks)', () => {
    // In this suite we walk the generated trie, to find all paths in the trie.
    // We can't really do profile guided fuzzing on a data structure, but we can
    // we ensure that all paths are equivalent. In addition to testing all paths
    // against what we get from the simpler evalRulesRecursively(), we also test
    // all paths with a set of interesting suffixes, like '*' (kleene) or any
    // character that is part of the patterns in the rules
    for (const {title, rules} of testCases) {
      test(title, () => {
        const t = trie.build(rules);
        const suffixes = _.uniq(allPairs(_.uniq([
          '', '*', '**',  // these suffixes are always interesting
          '$', '@', '-',  // a few letters probably not used in any of the rules
          '<', '>', '.',
          ...rules.map(r => r.pattern).join('').split(''),
        ])).map(p => p.join('')));
        walk(t, path => {
          for (const suffix of suffixes) {
            const input = path + suffix;
            assume(trie.execute(t, input).scopes()).eql(
              evalRulesRecursively(rules, input),
              `expected execute(trie, "${input}") == evalRulesRecursively(rules, "${input}")`,
            );
          }
        });
      });
    }
  });

  // withPrefix + build + execute (for all walks)
  // withSuffix + build + execute (for all walks)
  // withPrefix + withSuffix + build + execute (for all walks)
  // withSuffix + withPrefix + build + execute (for all walks)

  // withPrefix recursively
  // withSuffix recursively
  // withPrefix + withSuffix interleaved recursively
  // withSuffix + withPrefix interleaved recursively
});
