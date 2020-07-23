audience: deployers
level: major
reference: issue 3148
---
The web-server service now stores Github access tokens in a dedicated table and accesses them directly, rather than via taskcluster-lib-entities.  This upgrade drops existing tokens, meaning that users will need to sign in again after the upgrade is applied.  This migration is very fast.
