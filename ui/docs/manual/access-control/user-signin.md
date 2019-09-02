---
title: User Sign-In
order: 20
---

The Taskcluster user interface allows users to sign in, interfacing with various user-authentication systems.
This implementation is a fairly typical web-application sign-in system, using cookies to maintain sessions.

The user interface backend (web-server) generates Taskcluster Credentials based on the user's identity.
In general, these credentials have a number of `assume:..` scopes corresponding to the user's group or team membership.
By managing the corresponding roles, Taskcluster administrators can control the user's access.

The [web-server reference](/docs/reference/core/web-server) has more detail on how login strategies work.
The [deployment documentation](/docs/manual/deploying) has more detail on how login strategies are configured, which will determine what strategies are available in a deployment.
