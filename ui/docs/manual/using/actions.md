---
title: Defining User Actions on Existing Tasks
---

[Actions](/docs/manual/conventions/actions) allow users to affect a task or task-graph after it has been submitted.
Common actions are:

-   Retrigger a task,
-   Retry specific test cases many times,
-   Obtain a loaner machine,
-   Backfill missing tasks,

Actions are defined in-tree, so they are specific to the software being built and can be modified through the usual review process.
Taskcluster defines a [convention](/docs/manual/conventions/actions) which allows user interfaces to connect users to these actions.

## Choosing a Kind

The "task" kind requires that the user invoking the task has all of the scopes
necessary to run the action task (and to create any further tasks). Granting
such scopes allows a user to perform undesirable actions with the Taskcluster
API.

The "hook" kind allows more control over users' permissions. The key
observation is that `hooks.triggerHook` is governed by a scope of the form
`hooks:trigger-hook:<hookGroupId>/<hookId>`, but the task it creates uses role
`hook-id:<hookGroupId>/<hookId>`. The method also verifies its payload against
the hook's `triggerSchema`.  This allows a controlled privilege escalation:
only clients with the appropriate `trigger-hook` scope may trigger a hook, and
only if they provide a payload matching the `triggerSchema`. If both of those
conditions are met, then the resulting task may execute with permissions the
originating client does not posses.

To design a hook-based action, start with the hook and consider the minimal
inputs that it requires. For example, a hook to re-trigger a task with
`DEBUG=*` needs only a taskId. Construct the hook with a `triggerSchema`
allowing only those minimal inputs in an appropriate form (avoiding quoting
vulnerabilities), and if possible add additional checks within the task itself
-- for example, check that the task to be re-triggered has the expected
schedulerId, workerType and provsionerId,

Then consider who should be allowed to trigger the hook, and distribute the
`hooks:trigger-hook` scope accordingly. Note that even if this scope is
available only to a few users or clients, it is best to limit inputs carefully
to avoid those users being "tricked" into running a malicious action.

Once the hook is complete and functional, only then should you design the
`actions.json` entry to trigger it.  At this point you should remember that the
schema is only for documentation, and you cannot rely on the integrity of
`actions.json`.  A "hook" action is just a template for how to call
`hooks.triggerHook` and does not offer any level of security.
