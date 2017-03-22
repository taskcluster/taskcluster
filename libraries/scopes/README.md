TaskCluster Scopes Utilities
============================

Simple utilities to validate scopes, scope-sets, and scope-set satisfiability.

For information on scopes, see [the TaskCluster documentation](https://docs.taskcluster.net/manual/integrations/apis/scopes).

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
