audience: users
level: major
reference: issue 8867
---
Pulse-triggered hooks now validate matching pulse message payloads against the hook's `triggerSchema` before creating a task.
If a pulse message matches the hook's `bindings` but fails `triggerSchema` validation, the message is discarded and no task is created.
This is a breaking change: previously `triggerSchema` was only enforced on the API and webhook paths, and pulse messages fired the hook regardless of their payload.
Validation is unconditional, including for hooks that did not set a `triggerSchema`: the default schema only accepts an empty payload, so such a hook will no longer fire on pulse messages that carry a payload.
Before upgrading, review all hooks with pulse `bindings` and make sure each `triggerSchema` accepts the pulse payloads that should still create tasks, for example by allowing expected properties or using `additionalProperties: true`.
