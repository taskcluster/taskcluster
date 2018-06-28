---
title: Roles and Role Expansion
order: 30
---

A _role_ consists of a `roleId`, a set of scopes, and a description. Each role
constitutes a simple _expansion rule_ that says if you have the scope
`assume:<roleId>` then your expanded roles also contain the set of scopes
associated with the role named `roleId`. The expansion continues recursively
until no further expansion is possible, however, roles must be acyclic.

## Example

Given the roles

```
group:admins -> admin-scope-1
                admin-scope-2
                assume:group:devs
group:devs   -> dev-scope
```

The scopeset `["assume:group:admins", "my-scope"]` would expand to

```js
[
    "admin-scope-1",
    "admin-scope-2",
    "assume:group:admins",
    "assume:group:devs",
    "dev-scope",
    "my-scope",
]
```

## Stars in Roles

As in scopes, a final `*` in a role ID acts as a wildcard. There are actually
two different kinds of `*` expansion:

 * (scope expansion) An `assume` scope ending in a star will satisfy any scope
   implied by any role of which it is a prefix. For example, given

   ```
   repo:github.com/taskcluster/taskcluster-auth -> secrets:get:auth-tests
   ```

   The scopeset `["assume:repo:github.com/taskcluster/*"]` would expand to
   include `"secrets:get:auth-tests"`.  This means that `assume:` scopes ending
   in a star can be very powerful!

 * (role expansion) A role ending in a star will apply to all roles of which it
   is a prefix. For example, given

   ```
   hook-id:taskcluster/* -> queue:create-task:aws-provisioner/taskcluster-hooks
   ```

   The scopeset `["assume:hook-id:taskcluster/nightly-diagnostics"]` will expand
   to include `"queue:create-task:aws-provisioner/taskcluster-hooks"`.

## Parameterized Roles

A role with a final `*` can be parameterized on the suffix of the input string
that matched the `*`.  Any appearance of `<..>` in the scopes will be replaced
with the suffix.  For example, given

```
project-admin:* -> auth:create-role:project-<..>/*
                   secrets:get:project/<..>/*
```

a scope-set containing `"assume:project-admin:zap"` would expand to include

```js
[
    "assume:project-admin:zap",
    "auth:create-role:project-zap/*",
    "secrets:get:project/zap/*",
]
```

### Limits
 * Parameter substitution `<..>` may only appear once in a scope.
 * Scopes on the form `prefix*<..>` are not permitted, regardless of what
   `prefix` is, as the `*` star is ambiguous and leads to unsound expansions.
 * Roles must be acyclic regardless of the parameter, even `*` as discussed
   in the next section.

### Stars in Parameters

*WARNING*: be careful using `*` in scopes that will be expanded with a
parameterization, as results may not be what you expect.

As a special case, if there is a `*` in the input suffixed matched by the
role's `*`, then anything following the first `<..>` in the scope will be
considered "matched" by that `*` and not included in the expansion.  Continuing
the example above, `"assume:project-admin:ops*"` would expand to

```js
[
    "assume:project-admin:ops*",
    "auth:create-role:project-ops*", // NOT ..project-ops/*/*
    "secrets:get:project/ops*",      // NOT ..project/ops/*/*
]
```

The rationale for this special-case is that `["assume:project-admin:ops*"]`
satisfies `["assume:project-admin:ops-dns"]`, so the expansion of the former
must satisfy the expansion of the latter. In practice, this special case
generally eliminates punctuation, such as the `/` in the example above.

However, this can cause more insidious problems.  Consider, for example,

```
repo:github.com/* -> secrets:get:github/<..>/repo-secrets
```

The intent here is to allow a Github repository access to the `repo-secrets`
secret corresponding to its repo name.  With that in place, it might seem
reasonable to issue an organization-level scope like
`"repo:github.com/mozilla/*"` to an organization administrator. The expectation
is that this scope would expand to
`"secrets:get:github.com/mozilla/*/repo-secrets"`. The reality is that it
expands to `"secrets:get:github.com/mozilla/*"`, allowing access to secrets not
named `repo-secrets`.

It is worth recalling here that `*` in the middle of a scope has no special
meaning, so `"secrets:get:github.com/mozilla/*/repo-secrets"` would not be a
useful scope, as it would only apply to a repository literally named `*`.
