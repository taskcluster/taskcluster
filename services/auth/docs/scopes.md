---
title: Scopes and Satisfaction
order: 10
---

A scope is simply a string, limited to printable ASCII characters. Scopes
generally travel in sets. A typical client will have a set of a few dozen
scopes. For example:

```js
[
    "queue:create-task:aws-provisioner-v1/tutorial",
    "queue:route:index.garbage.*",
    "secrets:get:garbage/*",
    "secrets:set:garbage/*",
]
```

## Satisfaction

A set of scopes A is said to "satisfy" another set of scopes B if every scope
in B is also in A. In a practical sense, A is often the set of scopes
associated with some Taskcluster credentials, and B is the set of scopes
required by an API call. If A satisfies B, then the call is permitted.

The more mathematically inclined may like to think of this as a subset
relationship: B ⊆ A.

## Stars in Scopes

There is one piece of special syntax in scopes: a final `*` character acts as a
wildcard, matching any suffix. So `queue:create-task:test-provisioner/*`
satisfies `queue:create-task:test-provisioner/worker3`. The reverse is not
true. The wildcard only works at the end of a string: no more advanced
pattern-matching functionality is available.
