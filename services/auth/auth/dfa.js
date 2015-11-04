var _           = require('lodash');
var assert      = require('assert');
var Promise     = require('promise');
var ScopeResolver = require('./scoperesolver');

/**
 * Compare scopes a and b to see which comes first if sorted
 * Such that 'a*' comes before 'a', but otherwise normal order.
 *
 * Example: ['*', '', 'a*', 'a', 'a(', 'aa', 'b'] is a list sorted as such.
 *
 * The reasoning for this sorting is pretty simple. If we have a set of scopes:
 *   ['a', 'a*', 'ab', 'b']
 * We wish to normalize the scope sets while merging, such that we don't have
 * duplicates and redundant scopes. If we sort the set of scopes above we get:
 *   ['a*', 'a', 'ab', 'b']
 * Now if we wish to construct the normalized scope-set, we just takes the
 * scopes out of the list one by one in the sorted order. And if the last scope
 * added the to normalized result list doesn't satisfy the current scope, the
 * current scope is added to the result list.
 *
 * Formally, we say that a scope-set S is normalized if there is not two scopes
 * a, b in S such that a satisfies b.
 *
 * On the above list, normalization would look like this:
 *   R = []                       // Normalized result list
 *   S = ['a*', 'a', 'ab', 'b']   // Sorted input list
 *   L = null                     // Last normalized scope
 * Step 1:
 *   'a*' = S[0]
 *   does L satisfy 'a*', answer: NO
 *   R.push('a*')
 *   L = 'a*'
 * Step 2:
 *   'a' = S[1]
 *   does L satisfy 'a', answer: YES (L = 'a*')
 *   Then we skip 'a'
 * Step 3:
 *   'ab' = S[2]
 *   does L satisfy 'ab', answer: YES (L = 'a*')
 *   Then we skip 'ab'
 * Step 4:
 *   'b' = S[3]
 *   does L satisfy 'b', answer: NO (L = 'a*')
 *   R.push('b')
 *   L = 'b'
 * Done:
 *   R, satisfies all the scopes in S, but it's smaller, and doesn't have any
 *   duplicates, or scopes that satisfies other scopes.
 *
 * We perform normalization in the process of merging scope sets; see below.
 */
let scopeCompare = (a, b) => {
  let n = a.length;
  let m = b.length;

  let d = Math.abs(n - m);
  if (d == 0) {
    if (a[n - 1] === '*' || b[n - 1] === '*') {
      if (a.startsWith(b.slice(0, -1))) {
        if (a[n - 1] === '*') {
          return -1;
        }
        if (b[n - 1] === '*') {
          return 1;
        }
      }
    }
  } else if (d == 1) {
    if (n > m && a[n - 1] === '*') {
      if (a.startsWith(b)) {
        return -1;
      }
    }
    if (m > n && b[m - 1] === '*') {
      if (b.startsWith(a)) {
        return 1;
      }
    }
  }

  return a < b ? -1 : 1;
};

/** Assumes scopes to be unique, and sorts scopes for use with mergeScopeSets */
let sortScopesForMerge = (scopes) => {
  return scopes.sort(scopeCompare);
};

// Export sortScopesForMerge
exports.sortScopesForMerge = sortScopesForMerge;


/**
 * Take two sets of sorted scopes and merge them, normalizing in the process.
 * Normalizing means removing duplicates, as well as scopes implied by a
 * star-scopes.
 *
 * This method returns a new array, and leaves both arguments untouched.
 * Hence, you should not clone arrays prior to calling this method.
 *
 * Returns a set of normalized scopes. See scopeCompare for formal definition
 * for normalized scope-set.
 */
let mergeScopeSets = (scopes1, scopes2) => {
  // This is dead simple, we track the length with n and m
  let n = scopes1.length;
  let m = scopes2.length;
  // And we track the current offset in the scopes1 and scopes2 using
  // i and j respectfully. This ensure that we don't have modify the arguments.
  let i = 0;
  let j = 0;
  let scopes = [];
  while (i < n && j < m) {
    // Take a scope for each list
    let s1 = scopes1[i];
    let s2 = scopes2[j];
    let scope = null;
    if (s1 === s2) {
      // If the two scopes are exactly the same, then we add one of them
      // and we increment both i and j by one.
      scopes.push(s1);
      scope = s1;
      i += 1;
      j += 1;
    } else {
      // If the scopes are different, we compare them using the function used
      // for the sort order and choose the one that comes first.
      let z = scopeCompare(s1, s2);
      if (z < 0) {
        scope = s1;
        scopes.push(s1);
        i += 1;
      } else {
        scope = s2;
        scopes.push(s2);
        j += 1;
      }
    }
    // If we just added a star scope, we have to skip everything that
    // is satisfied by the star scope.
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while(i < n && scopes1[i].startsWith(prefix)) {
        i += 1;
      }
      while(j < m && scopes2[j].startsWith(prefix)) {
        j += 1;
      }
    }
  }
  // At this stage i = n or j = m, meaning that one of our two lists is now
  // empty, so we just add everything from one of them. But to ensure
  // normalization, we still do the endsWith('*') trick, skipping scopes that
  // are already satisfied.
  while (i < n) {
    let scope = scopes1[i];
    scopes.push(scope);
    i += 1;
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while(i < n && scopes1[i].startsWith(prefix)) {
        i += 1;
      }
    }
  }
  while (j < m) {
    let scope = scopes2[j];
    scopes.push(scope);
    j += 1;
    if (scope.endsWith('*')) {
      let prefix = scope.slice(0, -1);
      while(j < m && scopes2[j].startsWith(prefix)) {
        j += 1;
      }
    }
  }
  return scopes;
};

// Export mergeScopeSets
exports.mergeScopeSets = mergeScopeSets;

/**
 * Sort roles by roleId, such that 'a', comes right after 'a*'
 *
 * Example: ['', 'a*', 'a', 'a(', 'aa', 'b'] is a list sorted as such.
 *
 * We do this such that we get a list looking a but like this:
 *  1. client-id:a
 *  3. client-id:try*
 *  2. client-id:try
 *  4. client-id:try-more
 *  5. client-id:z
 *
 * The cool thing is that when generating a DFA for this list all the possible
 * candidates (1-5) have the same path until we reach the 11th character.
 * At the 11th character the string diverge and any DFA constructed must
 * naturally have more than one state. However, for 11th character our DFA still
 * only needs 3 states, one representing (1), (2-4) and (5). But sorting the
 * list of roles, we represent these subsets elegantly and efficiently using
 * array offsets in the list of roles.
 *
 * More details on this later, for now just know that it makes DFA construct
 * both efficient and elegant (not to mention easy).
 */
let sortRolesForDFAGeneration = (roles) => {
  return roles.sort((a, b) => scopeCompare(a.roleId, b.roleId));
};

// Export sortRolesForDFAGeneration
exports.sortRolesForDFAGeneration = sortRolesForDFAGeneration;

/**
 * Build a DFA of states of the form:
 * ```js
 * {
 *   'a': { ... },  // next state if the current character is 'a'
 *   'end': x,      // index s.t. sets[x] is the roles granted if the scope
 *                  // ends here (end of scope string).
 *   'default': y   // index s.t. sets[y] is the roles granted if the scope
 *                  // doesn't match a next state.
 * }
 * ```
 * The `sets` object is an array given as parameter that new sets of roles will
 * be added to. This ensures that we don't create two array objects to represent
 * the same set of roles. For efficiency, sets[i] for some i, may be an array
 * of indexes s.t. that sets[i] = [..., j] for some j < i. The set is to be
 * interpreted as [...].concat(sets[j]), we allow this for efficiency.
 *
 * Given a set of roles, we want to build a recognizer that will match a given
 * scope against those roles, including support for the kleene star (`*`) in the
 * scope and in the roles.  When a scope is recognized, it should be trivial to
 * read off the set of matched roles.
 *
 * If we recall basic language theory we know that DFAs can recognize all
 * regular languages. Constructing a DFA for a regular language is, however, not
 * trivial. Typically regular languages are expressed as regular expressions,
 * and indeed the kleene star in our roleIds is similar to /.*$/. The classic
 * approach involves constructing an NFA from your regular expression, then
 * if transforming to a DFA and minimizing the DFA. This doesn't really work for
 * us as the NFA to DFA and DFA minimization operations are quiet expensive.
 *
 * However, we don't need to the full expressiveness of regular expressions. If
 * We consider the following set roleIds:
 *  1. a
 *  2. b*
 *  3. b
 *  4. bc
 *  5. c
 *
 * The quick reader may observe that when represented like this we may
 * represent each state of a DFA as character index k, start i and end n offset
 * in the list of possible roleIds matched.  Indeed the generateDFA(roles, i,
 * n, k, sets, implied) function generates a DFA state for roles[i:n]
 * matching character at index k where sets[implied] are previously matched.
 *
 * If we take the roleIds above and generate the DFA state using the generateDFA
 * function below we will get a structure as follows:
 * ```js
 * {
 *   default: 0,                // sets[0] = []
 *   'a': {
 *          end: 1              // sets[1] = ['a']
 *          default: 0,         // sets[0] = []
 *          '*': {
 *                  end: 1,     // sets[1] = ['a']
 *                  default: 1  // sets[1] = ['a']
 *               }
 *        },
 *   'b': {
 *          end: 2,             // sets[2] = ['b', 3] -> ['b', 'b*']
 *          default: 3,         // sets[3] = ['b*']
 *          'c': {
 *                  end: 4,     // sets[4] = ['bc', 3] -> ['bc', 'b*']
 *                  default: 3  // sets[3] = ['b*']
 *                  '*': {
 *                      end: 1,     // sets[4] = ['bc', 3] -> ['bc', 'b*']
 *                      default: 1  // sets[3] = ['b*']
 *                  }
 *               },
 *          '*': {
 *                  end: 5,     // sets[5] = ['b', 'bc', 3] -> ['b', 'bc', 'b*']
 *                  default: 3  // sets[3] = ['b*']
 *               }
 *        },
 *   'c': {
 *          end: 6              // sets[6] = ['c']
 *          '*': {
 *                  end: 6,     // sets[6] = ['C']
 *                  default: 0  // sets[0] = []
 *               }
 *        },
 *   '*': {
 *          end: 7              // sets[7] = [ 'a', 'b', 'b*', 'bc', 'c' ]
 *        }
 * }
 * ```
 *
 * If we we don't have an explicit transition we go to default, hence, if the
 * first character is 'd', the DFA would terminate with 0 as the result, and the
 * set of roles matched would be sets[0] = []. If the first character is 'b', we
 * have already matched the role 'b*', and indeed we see that all the "default"
 * transitions under the 'b' transition would return a set that contains 'b*'.
 *
 * Must be started with:
 *   i = 0, n = roles.length, k = 0, sets = [[]], implied = 0
 *
 * The `implied` is the index of entry in sets that is implied. In the sub-tree
 * under 'b' transition (example above), implied will be 3 (sets[3] = 'b*'). We
 * use to avoid duplicating sets of roles, and for efficiency as we can
 * construct entries in sets as [role, implied].
 */
let generateDFA = (roles, i, n, k, sets, implied) => {
  var state = {default: implied, end: implied};
  // We have to empty array of roles then we're done, we just have the default
  // roles that was already implied and we can't possibly have anything else.
  if (i >= n) {
    return state;
  }
  // We now get a reference to the first role from this subset: j = i
  var j = i;
  var role = roles[j];
  var current = role.roleId[k]; // current character
  // Recall that '*' and '' are sorted to top
  if (current === '*' && role.roleId.length === k + 1) {
    // If current character is a kleene star and the roleId ends after it, then
    // we have already matched a prefix role, so we extend the implied set to
    // include the current role.
    implied = sets.push([role, implied]) - 1;
    // And change the default transition for the current state to implied
    state.default = implied;
    state.end = implied;
    // Now we move to the next role, if there is one
    j += 1;
    if (j >= n) {
      // If there is no next role, we add a '*' transition as we always want to
      // have such a transition. Technically, we don't need it at this level,
      // but to avoid duplicates in sets, we may lookup state['*'].end on for
      // any state returned. So we require the '*' -> {end: ..., default: ...},
      // transition.
      state['*'] = {end: implied, default: implied};
      return state;
    }
    // Find next role and current character
    role = roles[j];
    current = role.roleId[k];
  }
  var afterImplied = j;
  var splitCount = 0;
  if (role.roleId.length === k) {
    // If current roleId ends here then this is an accepting state for the
    // terminal roleId assigned to role. We add the current role to the implied
    // set and sets it's index as state.end.
    state.end = sets.push([role, implied]) - 1;
    // Now we move to the next role, if there is one
    j += 1;
    splitCount += 1;
    if (j >= n) {
      // Again we add a transition for '*', this time we actually need it, as
      // the current role is given for after '*' -> end transition.
      state['*'] = {end: state.end, default: implied};
      return state;
    }
    // Find next role and current character
    role = roles[j];
    current = role.roleId[k];
  }
  var start = j;
  while(j < n) {
    role = roles[j];
    var c = role.roleId[k];
    // Here we go through the roles in the sorted order given, and whenever we
    // encounter a new character we generate a DFA state for it, giving it the
    // start and end-offset in the roles list of when we first saw the character
    // and when it ended.
    if (c !== current) {
      state[current] = generateDFA(roles, start, j, k + 1, sets, implied);
      current = c;
      start = j;
      splitCount += 1;
    }
    j += 1;
  }
  // Same as inside the loop, just for the last character
  state[current] = generateDFA(roles, start, j, k + 1, sets, implied);

  // There must always be a transition for the '*', if it is matched in the
  // scope we're scanning then we must go to a state where if the scope ends
  // you get all the roles is the current sub-tree. This is because '*' at the
  // very end of a scope grants all the scopes matching it up to that '*'.
  var star = state['*'] = state['*'] || {default: implied};

  // if there is only one transition from this state then the current state has
  // the same sub-tree as the state of that transition. Hence, we can just take
  // sets index from the '*' -> end of that transition. Note, this is the place
  // where we require that all states returned contains a '*' -> end transition.
  if (splitCount === 0) {
    star.end = state[current]['*'].end;
  } else {
    let set = roles.slice(afterImplied, n);
    set.push(implied);
    star.end = sets.push(set) - 1;
  }

  return state;
};

// Export generateDFA
exports.generateDFA = generateDFA;

/**
 * Builds a pair {resolver, sets} where sets is a list of lists of roles,
 * and given a scope `resolver(scope)`` returns an index from sets.
 *
 * That definition sounds slightly complicated, it's actually very simple,
 * sets is on the form:
 * ```js
 * sets = [
 *   [{role}, ...],
 *   [{role}, ...],
 *   [{role}, ...]
 * ]
 * ```
 *
 * For efficiency we allow sets[i] = [{role}, ..., j] where j < i to be
 * interpreted as sets[i].concat(sets[j]). By not duplicating we don't have to
 * resolve `sets[j]` multiple times, even though the set appears in multiple
 * other sets.
 *
 * The `resolver` function returns an index in the sets array, as this allows
 * us to later create a new sets variable where roles have been expanded to
 * the scopes they imply, and just like that we can use the `resolver` to go
 * from scope to expanded scopes.
 */
let buildResolver = (roles) => {
  // Generate DFA
  roles = sortRolesForDFAGeneration(roles);
  let sets = [[]];
  let dfa = generateDFA(roles, 0, roles.length, 0, sets, 0);

  // Render a DFA state to code
  let renderDFA = (state, depth) => {
    var d = '';
    while (d.length < depth * 4) d += '    ';
    var c = '';
    if (typeof(state.end) === 'number') {
      c += d + 'if (n === ' + depth + ') {\n';
      c += d + '  return ' + state.end;
      c += d + '}\n'
    }
    // In each state we switch on the `scope` variable at the given depth.
    c += d + 'switch(scope[' + depth + ']) {\n';
    _.forEach(state, (s, character) => {
      if (character === 'default' || character === 'end') {
        return;
      }
      // For each key of the state object that isn't 'prefix' or 'end' we have
      // a transition to another state. So we render the switch for that DFA.
      c += d + '  case ' + JSON.stringify(character) + ':\n';
      c += renderDFA(s, depth + 1);
      c += d + '    break;\n';
    });
    c += d + '  default:\n';
    c += d + '    return ' + (state.default || 0) + ';\n';
    c += d + '}\n';
    return c;
  };
  // Initially the implied roles is the empty set [] == sets[0], which is why
  // we call with sets = [[]] and i = 0. Obviously, we start at character offset
  // zero, hence, depth = 0.
  let body = 'var n = scope.length;\n' + renderDFA(dfa, 0);

  // Create resolver function and give it both sets and scopes as parameters
  // then bind sets so that'll always return an entry from sets.
  let resolver = new Function('sets', 'scope', body);
  resolver = resolver.bind(null, sets);
  return {sets, resolver: (scope) => {
      // Optimization so our DFA only has to operate on roleId
      if (scope.startsWith('assume:')) {
        // TODO: note that this might be slightly improved by not taking a slice
        // here but instead modifying the offset at which the current character
        // is read from in renderDFA
        return resolver(scope.slice(7));
      }
      if (scope.endsWith('*') && 'assume'.startsWith(scope.slice(0, -1))) {
        return resolver('*');
      }
      // If it doesn't start with assume:... or a..* then we just return sets[0]
      // which is always the empty set.
      return 0;
    }
  };
};

// Export buildResolver
exports.buildResolver = buildResolver;

/**
 * Computes fixed point for roles and returns a resolver.
 * Will assume roles to be on the form `{roleId, scopes}`.
 * This will add the property `expandedScopes`, and internal properties
 * seen, impliedRoles that you should just disregard.
 *
 * The resolver returned will take a scope and return a set of scopes granted
 * by the scope. These will sorted such that they work with `mergeScopeSets`.
 */
let computeFixedPoint = (roles) => {
  // Add initial value for expandedScopes for each role R and sort roles
  for (let R of roles) {
    R.expandedScopes = null;
    R.scopes = sortScopesForMerge(R.scopes)
    R.impliedRoles = []; // roles that R can directly assume
    R.seen = 0; // later iteration this role was seen (used later)
  }

  let {resolver, sets} = buildResolver(roles);

  // Construct impliedRoles
  for(let R of roles) {
    let expandImpliedRoles = (index) => {
      sets[index].forEach(r => {
        if (typeof(r) === 'number') {
          expandImpliedRoles(r);
        } else if (!_.includes(R.impliedRoles, r) && r !== R) {
          R.impliedRoles.push(r);
        }
      });
    };
    R.scopes.forEach(scope => expandImpliedRoles(resolver(scope)));
  }

  // Construct expandedRoles as a fixed-point by traversing implied roles
  let iteration = 0;
  let traveseImpliedRoles = (R) => {
    let scopes = R.scopes;
    for (let r of R.impliedRoles) {
      // We traverse all implied roles as long as we haven't already seen them
      // in this iteration. But just incrementing the `iteration` variable for
      // each iteration, we don't have to track a list of roles we've seen,
      // which can be a little expensive as we allocate new memory.
      if (r.seen < iteration) {
        r.seen = iteration;
        if (r.expandedScopes) {
          // Note that if we've expanded the scopes for a role already, then
          // there is no reason to traverse this role for scopes as we clearly
          // have the fixed-point for this role.
          scopes = mergeScopeSets(scopes, r.expandedScopes);
        } else {
          scopes = mergeScopeSets(scopes, traveseImpliedRoles(r));
        }
      }
    }
    return scopes;
  };
  // TODO: make this faster with a simple DFS search and a past-waiting list
  //       this could probably be significantly faster. Might require some smart
  //       cycle handling logic, but it seems fairly feasible.
  //console.time("traveseImpliedRoles");
  // For each role we compute the fixed-point the set of scopes the role expands
  // to when all implied roles are considered. If roles are ordered
  // unfortunately, ie. 1 -> 2 -> 3 -> 4, we can end up traversing the entire
  // tree N times. Our unit tests is good example of this. To avoid these
  // degenerate cases we'll quickly shuffle the roles around. In practice such
  // degenerate cases probably don't exist, but processing order does affect
  // performance, so we shuffle just for good measure.
  for (let R of _.shuffle(roles)) {
    iteration += 1;
    R.seen = iteration;
    // Compute the fixed-point by traversing all implied roles and collecting
    // the scopes they grant us.
    R.expandedScopes = traveseImpliedRoles(R);
    R.impliedRoles = null;
  }
  //console.timeEnd("traveseImpliedRoles");

  // Compute scopeSets[i] set of scopes implied by role in sets[i], so that
  // the resolver can be used to resolve scopes
  //console.time("Compute scopeSets");
  let n = sets.length;
  let scopeSets = new Array(n);
  for (let i = 0; i < n; i++) {
    let scopes = [];
    //TODO: make this faster using a min-heap in mergeScopeSets so that can
    //      merge multiple sets at the same time.
    sets[i].map(r => {
      if (typeof(r) === 'number') {
        assert(r < i, "What!!!");
        return scopeSets[r]; // we know that r < i, hence, this works
      }
      return r.expandedScopes;
    }).forEach(s => {
      scopes = mergeScopeSets(scopes, s);
    });
    scopeSets[i] = scopes;
  }
  //console.timeEnd("Compute scopeSets");

  // As we've scopeSets[i] to be expanded scopes from roles in sets[i], we now
  // have that scopeSets[resolver(scope)] a list of scopes granted by scope.
  return (scope) => scopeSets[resolver(scope)];
};

// Export computeFixedPoint
exports.computeFixedPoint = computeFixedPoint;
