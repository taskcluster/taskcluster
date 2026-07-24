audience: users
level: minor
reference: issue 8867
---
The hook page now has a **Debug bindings** button that opens a Pulse-binding debugger drawer.
It watches the Pulse messages arriving on the hook's saved bindings and shows, per message, whether the payload passes the hook's `triggerSchema` or is .
This makes it easy to see why a Pulse-triggered hook is silently not firing after `triggerSchema` validation was introduced, without reading server logs.
