# Scopes Library

Simple utilities to validate scopes, scope-sets, and scope-expression satisfiability.

For information on scopes, see [the Taskcluster documentation](https://docs.taskcluster.net/docs/manual/design/apis/hawk/scopes).

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

Throughout Taskcluster, we need to represent the scopes required to perform
some operation.  In some cases, the requirements are complex, including
alternatives.  For example, creating a task can use either scopes containing
priority levels or the older form without priority levels.

These requirements take the form of _scope expression_.  Such an expression is
either a [valid scope](#valid-scopes) or an object with a single key -- either
`AnyOf` or `AllOf` -- mapping to an array of scope expressions.

A scope expression can be evaluated against an array of scopes to determine if the
scope expression is "satisfied" by the array of scopes. Satisfaction in this context
means that the following clauses are satisfied:

**`AllOf: [..]`** All sub-expressions must be satisfied.

**`AnyOf: [..]`** At least one sub-expression must be satisfied.

**`"<scope>"`:** The `<scope>` is
[satisfied](https://docs.taskcluster.net/docs/reference/platform/auth/scopes) by the scope-set.

Examples:
```js
"hooks:trigger-hook:proj-taskcluster/release"
```
```js
{AllOf: [
  "hooks:modify-hook:proj-taskcluster/release",
  "assume:hook-id:proj-taskcluster/release",
]}
```
```js
{AnyOf: [
  {AllOf: [
    "queue:scheduler-id:taskcluster-ui",
    {AnyOf: [
      "queue:create-task:lowest:proj-taskcluster/ci",
      "queue:create-task:very-low:proj-taskcluster/ci",
      "queue:create-task:low:proj-taskcluster/ci",
    ]}
  ]},
  "queue:create-task:proj-taskcluster/ci",
  "queue:define-task:proj-taskcluster/ci",
]}
```
### Correctness

The `validateExpression` function validates that an expression matches the
structur described above.

```js
// Scope Expression
assert(scopeUtils.validExpression({AnyOf: [{AllOf: ['a', 'b'}, {AllOf: ['c']}]});
```

### Satisfaction

Given an array of valid scopes, also referred to as a scopeset, this library
can check to see if the scopeset "satisfies" a given expression.

Scope set satisfaction is checked with with `satisfiesExpression` which takes
a scopeset as the first argument and a scope expression as the second.

**NOTE:** this function is entirely local and does no expansion of `assume:` scopes.
Call the authentication service's `expandScopes` endpoint to perform such expansion first, if necessary.

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

### Scopes Satisfying an Expression

If you wish to understand why a certain expression was satisfied by a scopeset you can use the `scopesSatisfying` function.
This takes the same `(scopeset, expression)` argument as `satisfiesExpression`, and returns `undefined` when the expression is not satisfied.
When the expression is satisfied, it returns a set of scopes that satisfied the expression.
The returned set of scopes is always a subset of the input `scopeset`.
In the case that the expression is satisfied, it is always true that `satisfiesExpression(scopesSatisfying(scopeset, expression))`.
The returned set of scopes is intuitively "the minimal set of scopes required to satisfy the expression" but is not quite minimal in one sense:
If several alternatives of an `AnyOf` are satisfied, then the scopes used to satisfy all such alternatives are included.

### Scopes Required to Satisfy an Expression

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

### Set Operations

This library supports some operations to combine sets of scopes (referred to as
"scopesets").

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

The `scopeCompare` function sorts the scopes such that a scope ending with a
`*` comes before anything else with the same prefix.  For example, `a*` comes
before `a` and `ax`.

In a given scopeset, one scope may satisfy another, making the latter
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

Given two properly-sorted, normalized scopesets, the `mergeScopeSets` function
will merge them into a new, sorted, normalized scopeset such that any scope
satisfied by at least one of the input scopesets is satisfied by the resulting
scopeset.
