audience: deployers
level: patch
reference: issue 5234
---
Added initial `/__heartbeat__` endpoint to all service APIs. Simply returning a 200 empty JSON object for now - implementation to follow in individual PRs per service.
Addresses issues 5234, 5236, 5237, 5238, 5239, 5240, 5241, 5242
