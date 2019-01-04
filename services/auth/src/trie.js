const assert = require('assert');
const ScopeSetBuilder = require('./scopesetbuilder');

// Construct character SUBSTITUTE used for representation of <..>
const PARAM = '\u001a';
const PARAM_TO_END = /\u001a.*$/; // eslint-disable-line no-control-regex

/**
 * Given a sorted list of scopes that contains PARAM, replace PARAM with param
 * and return the sorted result.
 */
const withParam = (scopes, param) => {
  const pattern = param.endsWith('*') ? PARAM_TO_END : PARAM;
  scopes = scopes.map(s => s.replace(pattern, param));
  return ScopeSetBuilder.normalizeScopeSet(scopes);
};

/** Node in a trie */
class Node {
  constructor(end = [], enter = [], paramed = [], kleeneOnly = []) {
    this.end = end;               // scopes given if input ends at this node
    this.enter = enter;           // scopes given if input traverses through this node
    this.paramed = paramed;       // scopes given if input traverses through this node with parameter
    this.kleeneOnly = kleeneOnly; // scopes given in addition to end, enter, paramed if input ends with kleene
    this._kleeneCache = null;     // scopes given if input ends with kleene at this node (lazily computed)
    this.children = new Map();    // map from next character to child node
  }

  dump() {
    return {
      end: this.end,
      enter: ScopeSetBuilder.normalizeScopeSet([...this.enter, ...withParam(this.paramed, '<..>')]),
      kleene: this.kleeneOnly,
      children: Array.from(this.children).reduce((result, [character, child]) => {
        result[character] = child.dump();
        return result;
      }, {}),
    };
  }

  /** Compute kleene, that is the result of reaching this node when next and final character is kleene */
  get kleene() {
    if (this._kleeneCache === null) {
      const result = new ScopeSetBuilder({optionallyClone: true});
      result.add(this.end);
      result.add(this.enter);
      result.add(withParam(this.paramed, '*'));
      result.add(this.kleeneOnly);
      for (const child of this.children.values()) {
        result.add(child.kleene);
      }
      // If there is exactly one child and no end or scopes at this node,
      // this will reuse the array from the child
      this._kleeneCache = result.scopes();
    }
    return this._kleeneCache;
  }

  /**
   * Merge node into this node after prefix, this method is the only permissible
   * way to modify a trie, and may only be called on the root of a trie.
   *
   * returns true, if this node or something in its sub-tree was modified.
   */
  merge(prefix, node) {
    let modified; // track if we modify this node
    if (prefix !== '') {
      // If there is a prefix, we find the child for the first character c of
      // the prefix (or create such a child), and merge node into that...
      let child = this.children.get(prefix[0]);
      let isNew = !child;
      if (isNew) {
        child = new Node();
      }
      modified = child.merge(prefix.slice(1), node);
      // We only save a new node if merging into it modified it, this prevents
      // us from poluting the trie with empty nodes.
      if (modified && isNew) {
        this.children.set(prefix[0], child);
      }
    } else {
      // Merge scopes from end, enter, paramed
      this.end = ScopeSetBuilder.mergeScopeSets(this.end, node.end);
      this.enter = ScopeSetBuilder.mergeScopeSets(this.enter, node.enter);
      this.paramed = ScopeSetBuilder.mergeScopeSets(this.paramed, node.paramed);
      this.kleeneOnly = ScopeSetBuilder.mergeScopeSets(this.kleeneOnly, node.kleeneOnly);
      // Track if we've modified the node by merging above
      modified = node.end.length > 0 || node.enter.length > 0 || node.paramed.length > 0 || node.kleeneOnly.length > 0;
      // For each child of the node, we merge the child into this node
      for (const [character, child] of node.children) {
        modified = this.merge(character, child) || modified;
      }
    }
    // Reset _kleeneCache, if something was modified in the sub-tree of this node
    if (modified) {
      this._kleeneCache = null;
    }
    return modified;
  }
};

// Export Node (for tests only)
exports._Node = Node;

/**
 * Travese the given path calling visit(node, prefix) for each intermediate node
 * along the path, before returning the node at path or null, if not reachable.
 *
 * Notice that '*' at end of path will not be interpreted as kleene.
 *
 * Example, given a trie with children for 'abc' as:
 *   node  --a-->  A  --b-->  B  --c-->  C
 * then traverse(node, 'abc', visit) will call visit(A, 'a') and visit(B, 'ab')
 * and finally return C. Or null, if somewhere along the path to there is no
 * child for the next character.
 */
const traverse = (node, path, visit = () => {}) => {
  const N = path.length - 1;
  if (N === -1) {
    return node;
  }
  for (let i = 0; i < N; i++) {
    node = node.children.get(path[i]);
    if (!node) {
      return null;
    }
    // Call visit with current node and path traversed so far
    visit(node, path.slice(0, i+1));
  }
  return node.children.get(path[N]) || null;
};

/**
 * Return scope without kleene '*' at the end if scope ends with kleene, otherwise
 * this just returns the scope given. Notice, this doesn't recursively strip '*'
 */
const withoutKleene = (scope) => scope.endsWith('*') ? scope.slice(0, -1) : scope;

/**
 * Execute returns a ScopeSetBuilder with scopes granted by given input.
 *
 * Notice that the result does not include the input itself, merging this in is
 * the responsibility of the caller, if this is used to expand scopes.
 */
const execute = (node, input, builder = new ScopeSetBuilder()) => {
  builder.add(node.enter);
  builder.add(withParam(node.paramed, input));
  node = traverse(node, withoutKleene(input), (node, path) => {
    // parameterize paramed with remaining input (kleene allowed here)
    builder.add(node.enter);
    builder.add(withParam(node.paramed, input.slice(path.length)));
  });
  if (node) {
    if (input.endsWith('*')) {
      builder.add(node.kleene);
    } else {
      builder.add(node.end);
      builder.add(node.enter);
      builder.add(withParam(node.paramed, ''));
    }
  }
  return builder;
};

// Export execute
exports.execute = execute;

/**
 * Transform rules from {pattern, scopes} to {pattern, scopes, matched, paramed},
 * where:
 *  - matched, is the non-parameterized scopes, and
 *  - paramed, is the parameterized scopes with PARAM instead of '<..>'
 */
const transformRules = (rules) => rules.map(({pattern, scopes}) => {
  // If not a prefix rule, then we can't have parameterized rules
  if (!pattern.endsWith('*')) {
    scopes = ScopeSetBuilder.normalizeScopeSet(scopes);
    return {pattern, scopes, matched: scopes, paramed: []};
  }
  // Find matched and paramed from scopes
  const matched = ScopeSetBuilder.normalizeScopeSet(scopes.filter(s => !s.includes('<..>')));
  const paramed = ScopeSetBuilder.normalizeScopeSet(
    scopes
      .filter(s => s.includes('<..>'))
      .map(s => s.replace('<..>', PARAM)),
  );
  // Validate legallity of parameterized scopes
  for (const s of paramed) {
    // We forbid more than one parameter injection
    if (s.includes('<..>')) {
      const scope = s.replace(PARAM, '<..>');
      const err = new Error(`parameterized scope '${scope}' contains multiple '<..>'`);
      err.code = 'InvalidScopeError';
      err.scope = scope;
      throw err;
    }
    // We forbid ambiguous kleenes
    if (s.endsWith('*' + PARAM)) {
      const scope = s.replace(PARAM, '<..>');
      const err = new Error(`parameterized scope '${scope}' ends with '*<..>' which implies an ambiguous kleene`);
      err.code = 'InvalidScopeError';
      err.scope = scope;
      throw err;
    }
  }
  return {pattern, scopes, matched, paramed};
});

/**
 * Create a topological sorting of rules according to dependencies, defined
 * as follows:
 *
 * r1:   A  -> B
 * r2:   B  -> C
 * r1 depends on r2
 *
 * r1:   A  -> B
 * r2:   B* -> C
 * r1 depends on r2
 *
 * r1:   A* -> B<..>
 * r2:   BX -> C
 * r1 depends on r2
 *
 * r1:   A  -> BX
 * r2:   B* -> C
 * r1 depends on r2
 *
 * For any two rules there is a dependency relationship if a parameterization
 * of one of the rules grants scopes that matches the other scope.
 *
 * This returns an topological ordering of rules, where <..> have been replaced
 * with PARAM in the scopes.
 *
 * If there is a dependency cycle this method will throw an error with
 * `err.code = 'DependencyCycleError'` and an `err.cycle` property.
 * If there is illegal scope patterns this method will throw an error with
 * `err.code = 'InvalidScopeError'` and an `err.scope` property.
 * This is the only effect of this method that useful outside this file.
 */
const dependencyOrdering = (rules = []) => {
  rules = transformRules(rules);
  // For each rule we must have an efficient way to find other rules that it
  // depends on. To do this we build a trie (because tries are fast), where
  // matching a rule gives the scope of its index value in the rules array.
  // This is a bit of a hack, but so long as numbers don't end with '*' the
  // ScopeSet will not merge them (which would be bad).
  const trie = new Node();
  rules.forEach((rule, index) => {
    // We use the index of a rule to indicate that it have been matched
    trie.merge(withoutKleene(rule.pattern), rule.pattern.endsWith('*')
      ? new Node([], [`${index}`])  // if pattern ends with kleene rule matches if node is entered
      : new Node([`${index}`], [])  // if pattern ends without kleene input must end in node
    );
  });
  // To find dependencies we assume the worst case that a rule is parameterized
  // with '*' and find all the rules matched by the scopes it has. We do not
  // need to consider indirect dependencies as we are using this to build a
  // topological sorting which will take those into consideration.
  const dependencies = ({matched, paramed}) => {
    return new Set([].concat(...[...matched, ...withParam(paramed, '*')].map(
      s => execute(trie, s).scopes().map(index => rules[index]),
    )));
  };
  // We could also have computed this using:
  //   const dependencies = (R) => {
  //     const scopes = [...R.matched, ...withParam(R.paramed, '*')];
  //     return rules.filter(({pattern}) => {
  //       return scopes.some(s => patternMatch(s, pattern)) || scopes.some(s => patternMatch(pattern, s));
  //     });
  //   };
  // However, this becomes rather slow as the number of rules increase. In fact
  // it would already dominate trie build time.

  const ordering = [];    // Final topological ordering
  const seen = new Set(); // rules we've seen (ie. this is the stack)
  const done = new Set(); // rules we've already output to the ordering

  // visit a rule to add it to the ordering
  const visit = (R) => {
    if (done.has(R)) {
      return; // Skip, if already in the ordering
    }
    // If R is on the stack (and !done.has(R)), we have a cycle...
    if (seen.has(R)) {
      const stack = [...seen]; // entries in Set are ordered by insertion order (neat)
      const cycle = [...stack.slice(stack.indexOf(R)), R].map(r => r.pattern);
      // Throw an error with the cycle
      const err = new Error(`Roles may not contain dependency cycles, found: '${cycle.join('\' -> \'')}'`);
      err.code = 'DependencyCycleError';
      err.cycle = cycle;
      throw err;
    }
    // Mark R as seen, and visit it's dependencies
    seen.add(R);
    for (const dep of dependencies(R)) {
      visit(dep);
    }
    // Add R to the ordering, and mark it as done
    ordering.push(R);
    done.add(R);
  };

  // Ensure that all rules are visited
  for (const R of rules) {
    visit(R);
  }

  // return our sorted value
  return ordering;
};

// Export dependencyOrdering
exports.dependencyOrdering = dependencyOrdering;

/**
 * Construct a trie where the given prefix have been pre-consumed.
 *
 * That is to say return a transformed trie, such that:
 *   execute(withPrefix(node, prefix), input)
 * is equivalent to:
 *   execute(node, prefix + input)
 *
 * This method doesn't not interpret '*' at the end of prefix as kleene. Hence,
 * the above equivalence does not hold for prefix = '...*' and input = ''.
 * In practice we forbid rules on the form 'A*<..>' because '*' is ambiguous,
 * hence, in withPrefix(node, 'A*') we shall never interpret '*' as kleene.
 *
 * Notice, this will NOT modify the input trie, but some of its children may be
 * referenced in the result of this method. Hence, modifying the resulting trie
 * will invalidate the input trie, and vice versa.
 */
const withPrefix = (trie, prefix = '') => {
  const enter = new ScopeSetBuilder({optionallyClone: true});
  const paramed = new ScopeSetBuilder({optionallyClone: true});

  // Find scopes granted along the path of the prefix
  enter.add(trie.enter);
  paramed.add(withParam(trie.paramed, prefix + PARAM));
  // Traverse prefix from trie
  const target = traverse(trie, prefix, (node, path) => {
    // Prefix <..> with the remainder of the path
    const remainder = prefix.slice(path.length);
    enter.add(node.enter);
    paramed.add(withParam(node.paramed, remainder + PARAM));
  });

  // if there is a target we have to add it's scopes too
  let end = [];
  let kleeneOnly = [];
  if (target) {
    end = target.end;
    kleeneOnly = target.kleeneOnly;
    enter.add(target.enter);
    paramed.add(target.paramed); // equivalent to withParam(target.paramed, '' + PARAM)
  }

  // Create a new root node
  const result = new Node(end, enter.scopes(), paramed.scopes(), kleeneOnly);

  // Insert children of node found after traversing prefix
  if (target) {
    for (const [character, child] of target.children) {
      result.children.set(character, child);
    }
  }

  return result;
};

// Export withPrefix
exports.withPrefix = withPrefix;

/**
 * Construct a trie where the given suffix have been pre-consumed.
 *
 * That is to say return a transformed trie, such that:
 *   execute(withSuffix(trie, suffix), input)
 * is equivalent to:
 *   execute(trie, input + suffix)
 *
 * This method does interpret '*' at the end of suffix as kleene, but it also
 * interprets '*' at the end of input as kleene. Hence, the above equivalence
 * does NOT hold if input = '...*' and suffix != ''.
 */
const withSuffix = (trie, suffix = '') => {
  const end = new ScopeSetBuilder({optionallyClone: true});

  // Any scopes attained by reaching the trie is also attained when suffix is added
  // we just need to postfix <..> with the suffix. Notice that kleene in suffix will
  // be handled correctly by withParam...
  const paramed = withParam(trie.paramed, PARAM + suffix);

  // Scopes attained by ending at this node are not reachable as we still have to
  // process the suffix. So we execute suffix on the current node and set those scopes
  // as the result of input ending here. We can do this as follows:
  //     result.end.add(execute(node, suffix));
  // However, since node.paramed will be accounted for in paramed above,
  // we shall re-implement execute without considering node.paramed, as follows:
  const target = traverse(trie, withoutKleene(suffix), (node, path) => {
    // parameterize scopes with remaining suffix (like we do in execute)
    end.add(node.enter);
    end.add(withParam(node.paramed, suffix.slice(path.length)));
  });
  // If we reached a target node we also have to consider scopes from it
  if (target) {
    if (suffix.endsWith('*')) {
      end.add(target.kleene);
    } else {
      end.add(target.end);
      if (trie !== target) {
        // If trie === target, then target.enter and target.paramed are already
        // accounted for with trie.enter, paramed in new Node(...) below.
        // Notice, if we had a scope 'A*<..>' parameterization with empty-string
        // would cause '*' to become kleene. We don't allow scopes on the form
        // 'A*<..>' for that specific reason ('*' is ambiguous). However, a
        // scope 'A*<..>B' is allowed an in build() after withPrefix(trie, 'A')
        // the resulting trie can contain a scope 'C*<..>', however, we'll always
        // called withSuffix(trie, 'B'), which would turn this into 'C*<..>B'.
        // So parameterization of empty string would never happen, but in tests
        // of withSuffix we do exercise this, hence, we should avoid it here.
        // some of the tests these will occur as we exercise all variations.
        end.add(target.enter);
        end.add(withParam(target.paramed, ''));
      }
    }
  }

  // If we end at this node with kleene the result.kleene property will include
  // end, kleeneOnly, enter and paramed from all children as they are added later.
  // However, trie.end and trie.kleeneOnly must also be added, as we interpret
  // input kleene to mean that the suffix is discarded.
  const kleeneOnly = ScopeSetBuilder.mergeScopeSets(trie.end, trie.kleeneOnly);

  const result = new Node(end.scopes(), trie.enter, paramed, kleeneOnly);

  // Reading another input character is the same as progressing to a child modified
  // using withSuffix, so we just add children created with withSuffix
  for (const [character, child] of trie.children) {
    result.children.set(character, withSuffix(child, suffix));
  }

  return result;
};

// Export withSuffix
exports.withSuffix = withSuffix;

/**
 * Build a trie from rules, s.t. execute(trie, scope) returns scope-set with all implied scopes.
 */
const build = (rules = []) => {
  const trie = new Node();

  // Build trie, inserting one rule at the time in order of dependency
  for (const {pattern, matched, paramed} of dependencyOrdering(rules)) {
    // Create node to merge in later
    const hasKleene = pattern.endsWith('*');
    const node = new Node(
      hasKleene ? [] : matched,
      hasKleene ? matched : [],
      hasKleene ? paramed : [],
    );

    // For each parameterized scope granted by matching this pattern we
    // construct the trie for what they would match.
    for (const scope of paramed) {
      // Since the scope includes a parameter, then we parse the prefix and suffix
      // of the parameter, s.t. scope == prefix + PARAM + suffix
      const [prefix, suffix] = scope.split(PARAM);
      // We then transform the full existing trie, with the assumption input is
      // prefix and suffixed as given in the scope, and merge with the current node
      // Note: because we're inserting in dependency order this cannot possibly depend
      //       on another rule that haven't been inserted yet, not even itself.
      let transformed = trie;
      if (prefix !== '') { // skip withPrefix if there is no prefix
        // Note that rules on the form: 'A*<..>B' are forbidden, so we need not
        // worry about the limitations of withPrefix wrt. input on the form
        // '...*' (as this could never happen)
        transformed = withPrefix(transformed, prefix);
      }
      if (suffix !== '') { // skip withSuffix if there is no suffix
        transformed = withSuffix(transformed, suffix);
      }
      // Notice that node.merge ALWAYS creates new nodes and never references
      // nodes from the trie being merged, this ensures that mutations in the
      // original trie won't affect node.
      node.merge('', transformed);
    }

    // Start new scope-set builder for scopes implied by matching pattern
    const impliedScopes = new ScopeSetBuilder({optionallyClone: true});
    // For each scope granted by matching pattern, we argument the trie
    for (const scope of matched) {
      // Since the scope is not parameterized, we just execute it on the current
      // trie and add the result to the set of scopes we want to grant.
      execute(trie, scope, impliedScopes);
    }

    // scopes implied by reaching this node are add to 'end' or 'enter' depending
    // on whether they are matched by reaching this node or ending at this node.
    if (hasKleene) {
      node.merge('', new Node([], impliedScopes.scopes(), []));
    } else {
      node.merge('', new Node(impliedScopes.scopes(), [], []));
    }

    // Upsert empty node at pattern (without possible kleene)
    trie.merge(withoutKleene(pattern), node);
  }

  return trie;
};

// Export build
exports.build = build;

/** Optimize trie by ensure that kleene is pre-computed */
const optimize = (trie) => {
  // NOTE: this is also a good place to add further post-processing optimization if any come to mind
  //       (granted it's usually better to do them on-the-fly, and consider construction time)

  // Ensure that we compute kleene for all nodes
  trie.kleene;
  return trie;
};

// Export optimize
exports.optimize = optimize;
