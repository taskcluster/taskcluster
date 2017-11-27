---
title: Roles and Role Expansion
order: 30
---

A _role_ consists of a `roleId`, a set of scopes, and a description. Each role
constitutes a simple _expansion rule_ that says if you have the scope
`assume:<roleId>` then your expanded roles also contain the set of scopes
associated with the role named `roleId`. The expansion continues recursively
until no further expansion is possible.

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
