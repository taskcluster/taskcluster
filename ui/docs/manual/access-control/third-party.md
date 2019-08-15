---
title: Third-Party Sign-In
order: 30
---

When Taskcluster is integrated with other web applications, it is useful for those web applications to be able to make REST API calls on behalf of a user.
The third-party sign-in process is being [rewritten to use an OAuth2 flow](https://github.com/taskcluster/taskcluster-rfcs/blob/master/rfcs/0147-third-party-login.md) and will be documented here.

The current implementation is described [here](/docs/manual/using/integration).
