---
title: Access Control
order: 25
---

Taskcluster has a sophisticated access-control system allowing fine-grained control of access to resources.
Most read operations (with the notable exception of secrets) are not access-controlled, but all operations with side-effects are subject to access control.

This chapter documents Taskcluster's access-control mechanisms at a high level, deferring to implementation documentation for details where necessary.
