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

### Double-Stars

The scope `foo:**` satisfies, on its face, any scope beginning with `foo:*`, including `foo:*123` and `foo:*` but not `foo:abc`.
If scope `foo:**` is used to create a temporary credential with `foo:*`, the operation will succeed (`foo:**` satisfies `foo:*`).
But the resulting temporary credential has `foo:*`, which *does* satisfy `foo:abc`, unlike the original credential.
In fact, this can occur anywhere a scope is delegated, including temporary credentials, authorizedScopes, task creation, client creation, and role creation.

The issue is a minor one, though, if we think of a scope ending with `**` (or any number of stars greater than one) as equivalent to a scope ending with a single star.

Taskcluster encourages this perspective by prohibiting scopes ending with `**` in clients and roles, and when creating tasks.
Instead, use the single-star form, avoiding any ambiguity.
