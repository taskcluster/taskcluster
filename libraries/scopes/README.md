TaskCluster Scopes Utilities
============================

Simple utilities to validate scopes, scope-sets, and scope-set satisfiability.
In short a scope is a string of printable ASCII characters including space,
match by `/^[\x20-\x7e]*$/`.

A scope `a` is set to satisfy `b`, if
 * `a = b`, or,
 * `a` is on the form `c'*'`, where `b = cd` for some string `d`.

A set of scopes _scope-set_ `A` is set to satisfy a set of scopes `B`
if for each scope `b` in `B` there is a scope `a` from `A` such that
`a` satisfies `b`.

A set of scope-sets `C` is said to be satisfied by a scope-set `A` if there is
a set of scopes `B` in `C` such that `A` satisfies `B`.

**Example**
The scope-sets `[['a', 'b'], ['c']]` is satisfied, if
 1. `'a'` and `'b'` is satisfied, or
 2. `'c'` is satisfied.

Essentially, scopes-sets forms a set of requirements on negation-free
disjunctive normal form.


**Usage**

Validation:

```js
let scopeUtils = require('taskcluster-lib-scopes');

// Check if input is a valid scope.
assert(scopeUtils.validScope("..."));

// Checks if the scopes in the sets are valid, and if form of the scope-sets is
// double nested arrays.
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']]));

// Checks if ['*'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']], ['*']));

// Checks if ['c'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']], ['c']));

// Checks if ['a', 'b'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']], ['a', 'b']));

// Checks if ['a*', 'b'] satisfies [['a', 'b'], ['c']] (spoiler alert it does)
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']], ['a*', 'b']));

// Checks if ['b'] satisfies [['a', 'b'], ['c']] (spoiler alert it doesn't)
assert(!scopeUtils.validateScopeSets([['a', 'b'], ['c']], ['b']));
```

Satisfaction:

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
