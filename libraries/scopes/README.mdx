# Scopes Library

Simple utilities to validate scopes, scope-sets, and scope-expression satisfiability.

For information on scopes, see [the Taskcluster documentation](../../ui/docs/manual/design/apis/hawk/scopes.mdx).

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

### Scope Expressions

There are two different but similar ways to combine scopes into larger sets.
The first way is using Scope Expressions which are newer and more expressive.
The second way is through nested arrays. Each layer of the nesting alternates
between or-ing and and-ing the contents of the array in "disjunctive normal form".
Prefer using the first way when possible. Following are pairs of identical
expressions in each type:

```
// New Style
{"AnyOf": ["abc", "def"]}
// Old Style
["abc", "def"]

// New Style
{"AnyOf": [{"AllOf": ["abc"]}, {"AllOf": ["def"]}]}
// Old Style
[["abc"], ["def"]]


// New Style
{"AllOf": ["abc", "def"]}
// Old Style
[["abc", "def"]]
```

### Correctness

This library provides a way to validate both styles of scope expressions.

```js
// New Style
assert(scopeUtils.validExpression({AnyOf: [{AllOf: ['a', 'b'}, {AllOf: ['c']}]});

// Old Style
assert(scopeUtils.validateScopeSets([['a', 'b'], ['c']]));
```

Old style scope expressions are always valid so long as they are nested arrays
that contain valid scopes for all elements.

New style scope expressions have a few more requirements. The following are
all invalid:

```
{} // Empty object
```

### Satisfaction

Given a scope set (an array of valid scopes), this library can check to see if the
scope set "satisfies" a given expression. This is done in two ways depending
on which form of expression is used.

#### New Style

These are the "new-style" way of dealing with scopes and allow for greater
flexibility than the old style. A _scope expression_ is a [valid scope](#valid-scopes)
or an object with a single key -- either `AnyOf` or `AllOf` mapping to an array
of scope expressions.

This check is performed with `scopeUtils.satisfiesExpression` which takes
a scopeset as the first argument and a scope expression as the second.

A scope expression can be evaluated against an array of scopes to determine if the
scope expression is "satisfied" by the array of scopes. Satisfaction in this context
means that the following clauses are satisfied:

**`AllOf: [..]`** All sub-expressions must be satisfied.

**`AnyOf: [..]`** At least one sub-expression must be satisfied.

**`"<scope>"`:** The `<scope>` is
[satisfied](/docs/reference/platform/taskcluster-auth/docs/scopes) by the scope-set.


Examples:

```js
// Evaluates to true
scopeUtils.satisfiesExpression(
  [
    'abc*',
  ],
  {
    AnyOf: ['abcd'],
  }
)

// Evaluates to false
scopeUtils.satisfiesExpression(
  [
    'abc*',
  ],
  {
    AnyOf: ['def'],
  }
)

// Evaluates to true
scopeUtils.satisfiesExpression(
  [
    'abc*',
  ],
  {
    AnyOf: [
      {AllOf: ['abcdef']},
      'def',
    ]
  }
)
```

#### Scopes Satisfying an Expression

If you wish to understand why a certain expression was satisfied by a scopeset you can use the `scopesSatisfying` function.
This takes the same `(scopeset, expression)` argument as `satisfiesExpression`, and returns `undefined` when the expression is not satisfied.
When the expression is satisfied, it returns a set of scopes that satisfied the expression.
The returned set of scopes is always a subset of the input `scopeset`.
In the case that the expression is satisfied, it is always true that `satisfiesExpression(scopesSatisfying(scopeset, expression))`.
The returned set of scopes is intuitively "the minimal set of scopes required to satisfy the expression" but is not quite minimal in one sense:
If several alternatives of an `AnyOf` are satisfied, then the scopes used to satisfy all such alternatives are included.

#### Scopes Required to Satisfy an Expression

If you wish to understand why a certain expression was *not* satisfied by a scopeset
you can use the `removeGivenScopes` function. The function returns a scope expression
where all scopes that exist are missing from the scopeset. Any scopes under an
`AllOf` key are definitely needed to satisfy the expression and at least
one of the scopes under an `AnyOf` must be provided to satisfy. If the scope
expression is satisfied by the scopes provided, this function returns `null`.

```js
scopeUtils.removeGivenScopes(
  [
    'abc',
  ],
  {
    AllOf: [
      {AnyOf: ['abc']},
      'def',
    ]
  }
)
// Returns
// {AllOf: ['def']}
```

### Old Style

These are evaluated with `scopeMatch`.

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
*requires* that its input is already sorted using `scopeCompare`. The whole
operation looks like this:

```js
let scopeset = ['a', 'a*', 'ab', 'b'];
scopeset.sort(scopeUtils.scopeCompare);
assert.equal(
    ['a*', 'b'],
    scopeUtils.normalizeScopeSet(scopeset));
```

The `scopeCompare` function sorts the scopes such that a scope ending with a
`*` comes before anything else with the same prefix.  For example, `a*` comes
before `a` and `ax`.

Given two properly-sorted, normalized scopesets, the `mergeScopeSets` function
will merge them into a new, sorted, normalized scopeset such that any scope
satisfied by at least one of the input scopesets is satisfied by the resulting
scopeset.
