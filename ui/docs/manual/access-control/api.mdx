---
title: API Access Control
order: 10
---

# API Access Control

All Taskcluster operations are accomplished by means of REST API calls.
These calls are authenticated and authorized using clients and scopes and based on the [Hawk](https://www.npmjs.com/package/@hapi/hawk) protocol.

The details are in [the design documentation](/docs/manual/design/apis/hawk), but the big picture is this:
Each REST API call comes with "Taskcluster Credentials" that describe a set of [scopes](/docs/manual/design/apis/hawk/scopes).
Each API method defines the scopes required to carry out the call, as desribed in the reference section.
As long as the scopes provided with a call "satisfy" the required scopes, the API call is allowed to complete.

## Scopes and Roles

Scopes are strings, and a set of scopes is just a set of strings.
A given set of scopes can "satisfy" a required set of scopes if every scope in the required set is also in the given set.

A scope in the given set that ends in `*` is treated as a pattern, and satisfies any scope of which it is a prefix.

[Roles](/docs/manual/design/apis/hawk/roles) form a kind of "macro expansion" for roles.
Briefly, a scope `assume:<roleId>` expands to all of the scopes associated with role `roleId`.
There are some interesting semantics to `*` for roles, described in the design documentation.

## Clients

Each request is associated with a [`clientId`](/docs/manual/design/apis/hawk/clients).
This can indicate a record in the table of pre-defined clients, but much more commonly names a temporary credential such as that for a worker executing a task.

An important point to note is that API access control is based entirely on scopes and involves no notion of "identity" - no "users" or "accounts".
Client IDs are for logging and auditing purposes and are not used for access control.
