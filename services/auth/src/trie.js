const _ = require('lodash');
const {scopeCompare, normalizeScopeSet, mergeScopeSets} = require('taskcluster-lib-scopes');

let normalized = (scopes) => {
  scopes.sort(scopeCompare);
  return normalizeScopeSet(scopes);
};

/**
 * Build a trie to expand patterns involving kleene stars.
 *
 * Given input of the form [{pattern, scopes}] with no pattern appearing more
 * than once, this builds a trie of states of the form:
 *
 * ```js
 * {
 *   'scopes': [..],      // scopes to add when entering this state
 *   'a': { ... },        // next state if the current character is 'a'
 *   ...
 *   'end': { ... },      // state if this is the end of the input
 * ```
 *
 * This takes into account both scope expansion (kleene star in the input
 * to the trie) and role expansion (kleene star in the pattern).  The
 * resulting trie does *not* take into account recursive application of
 * patterns.
 *
 * Note that, as applied to roles, the PATTERN for every rule begins with
 * `assume:`, but nothing in this file is specific to that prefix.
 */
exports.generateTrie = (rules) => {
  // generate the state for rules i .. n-1 starting at character position k.
  // This assumes that the rules have the same value at positions < k, as
  // assured by the sort order.  Thus we have three segments to work with,
  // in order:
  //         k
  // i -> ...*   -- (A) terminal * in pattern
  //      ...    -- (B) end of pattern (where pattern[k-1] != '*')
  //      ...*a  \
  //      ...a   -- (C) nonterminal * or other characters in pattern
  //      ...ab  /
  // n ->
  let gen = (i, n, k) => {
    let state = {};

    let j = i;
    while (j < n) {
      // find the current segment, at indices [seg .. j-1] or just [j]
      let current = rules[j].pattern[k]; // current character
      if (current === '*' && rules[j].pattern.length === k + 1) {
        // segment type A, terminal * in pattern; there can be only one, so
        // no need to scan more rules
        state.scopes = normalized(rules[j++].scopes);
      } else if (current === undefined) {
        // segment type B, end of pattern (with pattern[k-1] != '*'); there can
        // be only one, so no need to scan more rules
        state['end'] = {scopes: normalized(rules[j++].scopes)};
      } else {
        // segment type C, nonterminal * or other characters
        let seg = j;
        do {
          j++;
        } while (j < n && rules[j].pattern[k] === current);
        state[current] = gen(seg, j, k+1);
      }
    }

    // a terminal star in the input here (state['*']['end']) will match all
    // patterns, but we have already matched the `*` patterns (case A), so we
    // can skip those.
    while (i < n && rules[i].pattern[k] === '*' && rules[i].pattern.length === k + 1) {
      i++;
    }
    if (i < n) {
      let allScopes = normalized(_.flatten(rules.slice(i, n).map(r => r.scopes)));
      state['*'] = state['*'] || {};
      state['*']['end'] = {scopes: allScopes};
    }

    return state;
  };

  rules.sort((a, b) => scopeCompare(a.pattern, b.pattern));
  return gen(0, rules.length, 0);
};

/**
 * Executes the trie for a single input, returning an array of scopes
 * such that the scopes at result[k] were matched with input.slice(k)
 * not yet consumed (and thus available for parameterization).
 *
 * Note that the input is considered to be followed by an 'end' character,
 * so it may be that result.length > input.length; on the other hand, if
 * the trie completes matching before the input is consumed, result.length
 * can be smaller.
 */
exports.executeTrie = (trie, input) => {
  let state = trie;
  let result = [];
  let k = 0;

  while (state) {
    result.push(state.scopes);
    state = state[input[k++] || 'end'];
  }
  return result;
};
