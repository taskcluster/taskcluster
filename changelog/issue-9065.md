audience: users
level: patch
reference: issue 9065
---
UI: Dashboard and Worker Manager load pending/claimed counts in batched requests.
Public deployments must grant both `queue:pending-count:*` and `queue:claimed-count:*` to the `anonymous` role for these counts to appear.
