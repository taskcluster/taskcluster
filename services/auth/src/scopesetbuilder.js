const {scopeCompare, mergeScopeSets, normalizeScopeSet} = require('taskcluster-lib-scopes');

/**
 * BaseNode is the base-class for all node in an object-structure that holds a
 * tree of sorted scope sets as they are being merged.
 *
 * Merging a large set of normalized scope-sets using mergeScopeSets(A, B) is
 * expensive as it can only merge two scope-sets at a time, and allocates a new
 * array for all intermediate results. The complexity of merging N scopes split
 * between M scope-sets approaches something like O(N * M).
 *
 * Instead we shall create a binary tree of nodes where each leaf holds a
 * scope-set, then we compute the next value for internal node by taking the
 * value from a child. This leaves us with an average complexity closer to
 * something like O(N * log(M)), notes this just not proven math, merely a
 * casual guess backed by benchmarks.
 *
 * To make it even faster we allow nodes to return a different node (or this)
 * from the node.next() function, such that the return value is the tree after
 * consumption of the current value. As a final technicality we leave node.value
 * undefined until the first call of node.next(), such that we can support empty
 * nodes by returning null from node.next().
 */
class BaseNode {
  next() { new new Error('Node.next() not implemented'); }
};

/**
 * A LeafNode takes a normalized list of scopes and creates a merge-tree
 * consisting of one node.
 */
class LeafNode extends BaseNode {
  constructor(scopes) {
    super();
    this.scopes = scopes;
    this.index = 0; // index of next value
    this.value = null;
  }

  next() {
    if (this.index >= this.scopes.length) {
      return null; // if there is no next value
    }
    this.value = this.scopes[this.index];
    this.index++;
    return this;
  }
};

/**
 * A MergeNode takes two nodes and creates a single ScopeMergeTree node.
 */
class MergeNode extends BaseNode {
  constructor(A, B) {
    super();
    this.A = A.next();
    this.B = B.next();
    this.value = null;
  }

  next() {
    // If either A or B is null (we just return the other one)
    // Note: that we've already called node.next() on both of these.
    if (!this.A) { return this.B; }
    if (!this.B) { return this.A; }

    // Get values for easy reference
    const a = this.A.value;
    const b = this.B.value;

    if (a === b) {
      // If we have the same value in both we shall return and advance both A and B
      this.value = a;
      this.A = this.A.next();
      this.B = this.B.next();
    } else {
      // Otherwise, we take the first one according to scopeCompare, and advance
      // the matching child node
      const z = scopeCompare(a, b);
      if (z < 0) {
        this.value = a;
        this.A = this.A.next();
      } else {
        this.value = b;
        this.B = this.B.next();
      }
    }

    // If the value selected ends with kleene, we advanced both children until
    // they are null or we have value that doesn't start with said prefix.
    if (this.value.endsWith('*')) {
      const prefix = this.value.slice(0, -1);
      while (this.A && this.A.value.startsWith(prefix)) {
        this.A = this.A.next();
      }
      while (this.B && this.B.value.startsWith(prefix)) {
        this.B = this.B.next();
      }
    }

    // We set a value, so return this until next time we're called
    return this;
  }
};

/** Build a balanced ScopeMergeTree from list of normalized scope-sets */
const buildMergeTree = (scopeSets, i = 0, j = scopeSets.length - 1) => {
  if (i === j) {
    return new LeafNode(scopeSets[i]);
  }
  // Find mid-point and split the list in two, this creates a balanced binary tree
  const m = i + Math.floor((j - i) / 2);
  return new MergeNode(
    buildMergeTree(scopeSets, i, m),
    buildMergeTree(scopeSets, m+1, j),
  );
};

/** A builder pattern of merging normalized scope-sets */
class ScopeSetBuilder {
  /**
   * Create a ScopeSetBuilder for merging multiple sets of sorted scopes.
   *
   * Using the `optionallyClone` option you allow the ScopeSetBuilder to not
   * clone when creating results. If at-most one of the sets added to the
   * ScopeSetBuilder is non-empty and `optionallyClone` is set this will return
   * this object by reference. The `optionallyClone` is an optimization that
   * should only be used when input and output is immutable. Otherwise, it's
   * always safer to force clone the arrays, which is also default behavior.
   */
  constructor({optionallyClone} = {optionallyClone: false}) {
    this.optionallyClone = !!optionallyClone;
    this.sets = [];
  }

  /** Add a normalized scope-set given as an array */
  add(set) {
    if (set.length > 0) {
      this.sets.push(set);
    }
    return this;
  }

  /** Merge accumulated list of normalized scope-sets */
  scopes() {
    // Special case if there is no scope-sets we're done
    if (this.sets.length === 0) {
      return []; // so we don't have to handle the empty case in buildMergeTree
    }
    if (this.sets.length === 1 && this.optionallyClone) {
      return this.sets[0];
    }

    // Build a balanced ScopeMergeTree
    let tree = buildMergeTree(this.sets);

    // Take scopes from tree until it's empty, ie. tree.next() returns null
    // Notice: that we must call tree.next() before we read the first value.
    const result = [];
    while (tree = tree.next()) { // eslint-disable-line no-cond-assign
      result.push(tree.value);
    }
    return result;
  }

  /** Sort and normalize an otherwise randomized array of scopes */
  static normalizeScopeSet(scopes) {
    scopes.sort(scopeCompare);
    return normalizeScopeSet(scopes);
  }

  /**
   * Merge two normalized scope-sets without cloning if there is no changes.
   *
   * This is similar to scopeUtils.mergeScopeSets(A, B), but without any cloning
   * if either A or B is the empty array.
   */
  static mergeScopeSets(A, B) {
    if (A.length === 0) {
      return B;
    }
    if (B.length === 0) {
      return A;
    }
    return mergeScopeSets(A, B);
  };
}

// Export ScopeSetBuilder
module.exports = ScopeSetBuilder;
