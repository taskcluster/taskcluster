audience: deployers
level: major
---
With this version, the auth, hooks, and secrets services no longer verify signatures on rows read from database tables.  This is in preparation for a future version where these tables will no longer contain signatures.
