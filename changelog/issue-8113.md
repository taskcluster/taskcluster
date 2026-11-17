audience: deployers
level: patch
reference: issue 8113
---
The worker-manager `check-dangling-resources` job no longer reports ghost Azure resources.
Azure's subscription-wide list can keep returning such resources long after they were deleted, even though fetching them directly returns 404. The job now fetches each unattached resource before reporting it.
