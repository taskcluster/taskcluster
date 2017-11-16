Taskcluster Scopes Utilities
============================

Simple utilities to validate scopes, scope-sets, and scope-set satisfiability.

For information on scopes, see [the Taskcluster documentation](https://docs.taskcluster.net/manual/integrations/apis/scopes).

## Usage

```js
let scopeUtils = require('taskcluster-lib-scopes');
```

### Valid Scopes

The `validScope` function will determine if its input is a valid scope (string
containing ascii characters):

```js
// Check if input is a valid scope.
assert(scopeUtils.validScope("..."));
```

### Checking Scope Sets

The `validateScopeSets` function checks whether the scopes in the sets are
valid, and if form of the scope-sets is double nested arrays.  This is the
"disjunctive normal form" expected by
[taskcluster-lib-api](https://github.com/taskcluster/taskcluster-lib-api).

```js
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']]));
```

### Checking Scope Satisfaction

The first argument to `scopeMatch` is the set of scopes being tested.  The
second is an array of arrays of scopes, in disjunctive normal form, meaning
that one set of scopes must be completely satisfied.

```js
let myScopes = [
    'queue:create-task:aws-provisioner-v1/*',
    'secrets:get:garbage/my-secrets/*',
]
assert(scopeUtils.scopeMatch(myScopes, [
    // either both of these scopes must be satisfied
    ['queue:create-task:aws-provisioner-v1/my-worker', 'secrets:get:garbage/my-secrets/xx'],
    // or this scope
    ['some-other-scope'],
])
```

**NOTE:** this function is entirely local and does no expansion of `assume:` scopes.
Call the authentication service's `expandScopes` endpoint to perform such expansion first, if necessary.

More examples:
```js
// Checks if ['*'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.scopeMatch(['*'], [['a', 'b'], ['c']]));

// Checks if ['c'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.scopeMatch(['c'], [['a', 'b'], ['c']]));

// Checks if ['a', 'b'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.scopeMatch(['a', 'b'], [['a', 'b'], ['c']]));

// Checks if ['a*', 'b'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.scopeMatch(['a*', 'b'], [['a', 'b'], ['c']]));

// Checks if ['b'] satisfies [['a', 'b'], ['c']] (spoiler alert it doesn't)
assert(!scopeUtils.scopeMatch(['b'], [['a', 'b'], ['c']]));
```
### Set Operations

The intersection of two scopesets A and B is the largest scopeset C which is
satisfied by both A and B. Less formally, it's the set of scopes in both
scopesets.  The `scopeIntersection` function will compute this value:

```js
const scope1 = ['bar:*'];
const scope2 = ['foo:x', 'bar:x'];
assert.equal(['bar:x'], scopeUtils.scopeIntersection(scope1, scope2));
```

The `scopeUnion` function will compute the union of two scopesets.  The union
of two scopesets A and B is the largest scopeset C such that any scope
satisfied by C is satisfied by at least one of A or B.

Note that this function will change the order of the given scopesets.

### Sorting, Merging, and Normalizing

In a given set of scopes, one scope may satisfy another, making the latter
superfluous.  For example, in `['ab*', 'abcd', 'xyz']` the first scope
satisfies the second, so the scopeset is equivalent to `['ab*', 'xyz']`. A
scopeset that is minimized using this technique is said to be "normalized".

The `normalizeScopeSet` function will normalize a scopeset.  However, it
*requires* that its input is already sorted using `scopeCopmare`. The whole
operation looks like this:

```js
let scopeset = ['a', 'a*', 'ab', 'b'];
scopeset.sort(scopeUtils.scopeCompare);
assert.equal(
    ['a*', 'b'],
    scopeUtils.normalize(scopeset));
```

The `scopeCompare` function sorts the scopes such that a scope ending with a
`*` comes before anything else with the same prefix.  For example, `a*` comes
before `a` and `ax`.

Given two properly-sorted, normalized scopesets, the `mergeScopeSets` function
will merge them into a new, sorted, normalized scopeset such that any scope
satisfied by at least one of the input scopesets is satisfied by the resulting
scopeset.
