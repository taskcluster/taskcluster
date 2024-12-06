audience: users
level: major
reference: issue 3823
---
Add authentication to websockets at the time of subscribing to pulse messages

This introduces new scope `web:read-pulse` that needs to be added to the existing `anonymous` role
in order to keep Pulse subscriptions public.
